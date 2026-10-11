import type { JsonObject, NuxieActivity, NuxieClient, NuxieConfiguration } from '@nuxie/react-native';

/** Development-host observations. The independent server/log oracle owns verdicts. */
export interface ProbeConfiguration {
  caseName: string;
  consumer: string;
  platform: string;
  customerId: string;
  apiKeys: NuxieConfiguration['apiKeys'];
  event: string;
  triggerProperties: JsonObject;
  accepted: boolean;
}

function localEndpoint(endpoint: string) {
  if (!/^http:\/\/(?:127\.0\.0\.1|localhost|10\.0\.2\.2):\d+\/?$/.test(endpoint)) {
    throw new Error('Native v3 qualification requires a loopback fixture server');
  }
  return endpoint.replace(/\/$/, '');
}

export async function runV3Probe(client: NuxieClient, endpoint: string) {
  const base = localEndpoint(endpoint);
  const request = async (path: string) => {
    const response = await fetch(base + path);
    if (!response.ok) throw new Error(`Fixture request failed: ${path} (${response.status})`);
    return response.json();
  };
  const config: ProbeConfiguration = await request('/probe');
  const activities: NuxieActivity[] = [];
  const appActions: unknown[] = [];
  const errors: string[] = [];
  const states: unknown[] = [];
  const subscriptions = [
    client.onActivity(value => activities.push(value)),
    client.onAppAction(value => appActions.push(value)),
    client.onError(error => errors.push(error.message)),
    client.subscribeFeatures(() => states.push(client.getFeatures())),
  ];
  const checkpoints: string[] = [];
  const wait = async (name: string, condition: () => Promise<boolean> | boolean, timeoutMs = 60000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await condition()) { checkpoints.push(name); return; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Native v3 probe did not reach ${name}`);
  };
  let failure: string | undefined;
  let nativeVersion: string | undefined;
  try {
    await client.configure({ apiKeys: config.apiKeys, environment: 'development', logLevel: 'debug' });
    checkpoints.push('configured');
    const status = client.getStatus();
    if (status.state !== 'configured') throw new Error('Native configuration did not complete');
    nativeVersion = status.versions.native;
    await wait('initial-profile-delivered', async () => (await request('/status')).profileCount >= 1);
    await client.identify(config.customerId);
    checkpoints.push('identified');
    if (await client.getDistinctId() !== config.customerId) throw new Error('Native identity differs from probe customer');
    await wait('identified-profile-delivered', async () => (await request('/status')).identifiedProfileCount >= 1);
    if (config.accepted) await wait('features-ready', () => client.getFeatures().state === 'ready');
    await client.trigger(config.event, config.triggerProperties);
    checkpoints.push('triggered');
    if (config.accepted) await wait('journey-completed', () => activities.some(value => value.name === 'journey_completed'));
    for (let index = 0; index < 45; index++) {
      await client.trigger('wrapper_v3_transport_probe', { probeIndex: index, consumer: config.consumer });
    }
    await wait('native-event-transport-completed', async () => (await request('/status')).controlIndexes.length === 45);
    // This is a bounded post-transport settling period; it is not a rejection verdict.
    await new Promise(resolve => setTimeout(resolve, 2000));
    states.push(client.getFeatures());
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  } finally {
    const observation = { caseName: config.caseName, consumer: config.consumer, platform: config.platform,
      customerId: config.customerId, nativeVersion, checkpoints, activities, appActions, errors, states,
      finalFeatureState: client.getFeatures().state, failure: failure ?? null };
    const response = await fetch(base + '/observations', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(observation) });
    if (!response.ok) throw new Error('Could not retain native v3 observations');
    subscriptions.forEach(unsubscribe => unsubscribe());
    await client.shutdown();
  }
  if (failure) throw new Error(failure);
}
