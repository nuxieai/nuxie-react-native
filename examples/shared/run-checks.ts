import type { NuxieClient } from '@nuxie/react-native';
export interface CheckSettings { customerId: string; featureId: string; entityA: string; entityB: string; operationId: string }
/** Attended local validation. This intentionally spends one unit from entity A. */
export async function runChecks(client: NuxieClient, settings: CheckSettings, record: (name: string, value?: unknown) => void) {
  function verify(condition: boolean, message: string) { if (!condition) throw new Error(message); record(`PASS ${message}`); }
  // Locale changes take effect at the next native profile synchronization.
  // Reset makes repeated runs transition identity even when this customer is already stored.
  await client.setLocaleIdentifier('en_US');
  await client.setLocaleIdentifier(null);
  record('PASS locale override and device fallback');
  await client.reset();
  await client.identify(settings.customerId);
  verify(await client.getDistinctId() === settings.customerId && await client.getIsIdentified(), 'customer identity');
  await waitForReady(client);
  verify(client.getFeatures().state === 'ready', 'live Feature snapshot ready after identify');
  const read = (entityId: string) => client.hasFeature(settings.featureId, { entityId, policy: 'remote' });
  const cachedA = await client.hasFeature(settings.featureId, { entityId: settings.entityA });
  const a = await read(settings.entityA), b = await read(settings.entityB);
  verify(cachedA.allowed === a.allowed && cachedA.balance === a.balance && cachedA.unlimited === a.unlimited, 'default query resolves the entity scope');
  verify(a.allowed && a.balance !== null && a.balance >= 1, 'entity A has a real grant');
  const unknown = await client.hasFeature(settings.featureId, { entityId: `unknown-${settings.operationId}` });
  verify(!unknown.allowed, 'unknown entity denies');
  const command = { quantity: 1, operationId: settings.operationId, entityId: settings.entityA };
  const first = await client.consumeFeature(settings.featureId, command);
  verify(first.accepted, 'consumption committed');
  const replay = await client.consumeFeature(settings.featureId, command);
  verify(replay.accepted && replay.idempotentReplay && replay.balance === first.balance, 'same-ID retry does not spend twice');
  const afterA = await read(settings.entityA), afterB = await read(settings.entityB);
  verify(afterA.balance === a.balance! - (first.idempotentReplay ? 0 : 1), 'entity A charged exactly once');
  verify(afterB.balance === b.balance, 'entity B balance isolated');
  await client.reset();
  const anonymousId = await client.getAnonymousId();
  verify(anonymousId.length > 0 && !await client.getIsIdentified() && await client.getDistinctId() === anonymousId && anonymousId !== settings.customerId, 'reset rotates to anonymous identity');
  await client.identify(settings.customerId);
  await waitForReady(client);
  verify(client.getFeatures().state === 'ready', 'live Feature snapshot ready after reset and reidentify');
  record('API CHECKS PASSED', { operationId: settings.operationId, result: first });
}

function waitForReady(client: NuxieClient): Promise<void> {
  if (client.getFeatures().state === 'ready') return Promise.resolve();
  return new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error('Native Feature snapshot did not become ready within 15 seconds'));
    }, 15_000);
    const check = () => {
      if (client.getFeatures().state !== 'ready') return;
      clearTimeout(timeout); unsubscribe(); resolve();
    };
    unsubscribe = client.subscribeFeatures(check);
    check();
  });
}
