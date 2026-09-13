import type { NativeBinding } from './native-module';
import { NuxieError, asError } from './errors';
import type { AppAction, FeatureAccess, FeatureSnapshot, NuxieActivity, NuxieClient, NuxieConfiguration, NuxieStatus, PurchaseController, Unsubscribe } from './types';
import * as wire from './wire';

const EMPTY = wire.frozen<FeatureSnapshot>({ state: 'unknown', all: {}, revision: '0', identityGeneration: '0' });
const UNCONFIGURED = Object.freeze({ state: 'unconfigured' } as const);

/** Internal factory: applications receive one process singleton or inject their own public client. */
export function createClient(load: () => Promise<NativeBinding>): NuxieClient {
  let binding: NativeBinding | undefined;
  let status: NuxieStatus = UNCONFIGURED;
  let features = EMPTY;
  let session: string | undefined;
  let configurationKey: string | undefined;
  let controller: PurchaseController | undefined;
  let setup: Promise<void> | undefined;
  let stopping: Promise<void> | undefined;
  let detach: Unsubscribe | undefined;
  let epoch = 0;
  let identityEpoch = 0;
  const statuses = new Set<() => void>(), snapshots = new Set<() => void>();
  const activities = new Set<(value: NuxieActivity) => void>(), actions = new Set<(value: AppAction) => void>();
  const errors = new Set<(value: Error) => void>();
  const commerceRequests = new Set<string>();
  function report(error: unknown) { for (const listener of errors) { try { listener(asError(error)); } catch { /* Error reporting must not recurse. */ } } }
  function notify<T>(listeners: Set<(value: T) => void>, value: T) {
    for (const listener of [...listeners]) { try { listener(value); } catch (error) { report(error); } }
  }
  function subscribe<T>(listeners: Set<T>, listener: T): Unsubscribe { listeners.add(listener); return () => { listeners.delete(listener); }; }
  function setStatus(value: NuxieStatus) { status = Object.freeze(value); notify(statuses, undefined); }
  function publish(next: FeatureSnapshot) {
    const sameIdentity = next.identityGeneration === features.identityGeneration;
    if (sameIdentity && BigInt(next.revision) < BigInt(features.revision)) return;
    if (BigInt(next.identityGeneration) < BigInt(features.identityGeneration)) return;
    const all = Object.fromEntries(Object.entries(next.all).map(([key, value]) => {
      const previous = sameIdentity ? features.all[key] : undefined;
      return [key, previous && sameAccess(previous, value) ? previous : value];
    }));
    if (sameIdentity && next.revision === features.revision && next.state === features.state &&
      Object.keys(all).length === Object.keys(features.all).length && Object.entries(all).every(([k, v]) => v === features.all[k])) return;
    features = wire.frozen({ ...next, all });
    notify(snapshots, undefined);
  }
  async function commerce(name: string, payload: Record<string, unknown>, attachedSession: string) {
    const requestId = wire.string(payload.requestId), key = `${name}:${requestId}`;
    if (commerceRequests.has(key)) return;
    commerceRequests.add(key);
    const captured = controller, module = binding?.module;
    if (!module) return;
    let result: unknown;
    try {
      if (!captured) throw new Error('No external purchase controller is configured');
      result = name === 'purchase' ? await captured.purchase(wire.product(payload.product)) : await captured.restorePurchases();
      const outcome = wire.object(result);
      if (name === 'restore') wire.restore(outcome);
      else if (!['purchased', 'cancelled', 'pending'].includes(wire.string(outcome.type))) {
        if (outcome.type !== 'failed') wire.invalid('Unknown purchase outcome');
        wire.string(outcome.message);
      }
    } catch { result = { type: 'failed', message: 'External purchase controller failed' }; }
    if (session !== attachedSession) return;
    try {
      if (name === 'purchase') await module.completePurchase(attachedSession, requestId, wire.json(result));
      else await module.completeRestore(attachedSession, requestId, wire.json(result));
    } catch (error) { report(error); }
  }
  function receive(raw: string, expectedSession: string) {
    try {
      const event = wire.parse(raw);
      if (event.session !== expectedSession || session !== expectedSession) return;
      switch (event.name) {
        case 'features': publish(wire.snapshot(event.payload)); break;
        case 'activity': notify(activities, wire.activity(event.payload)); break;
        case 'appAction': notify(actions, wire.action(event.payload)); break;
        case 'purchase': case 'restore': void commerce(event.name, wire.object(event.payload), expectedSession).catch(report); break;
        default: wire.invalid('Unknown native event');
      }
    } catch (error) { report(error); }
  }
  function requireSession() {
    if (!binding || !session || status.state !== 'configured' || stopping) throw new NuxieError('notConfigured', 'Await Nuxie configuration before calling this API');
    return { module: binding.module, session, epoch, identityEpoch };
  }
  async function invoke<T>(operation: (context: ReturnType<typeof requireSession>) => Promise<T>, identitySensitive = false): Promise<T> {
    const context = requireSession();
    try {
      const result = await operation(context);
      if (context.epoch !== epoch || context.session !== session || (identitySensitive && context.identityEpoch !== identityEpoch)) {
        throw new NuxieError('staleOperation', 'The SDK session or customer changed while this operation was pending');
      }
      return result;
    } catch (error) { throw asError(error); }
  }
  const client: NuxieClient = {
    configure(configuration) {
      try {
        if (stopping) throw new NuxieError('shuttingDown', 'Await shutdown before configuring Nuxie');
        const normalized = normalize(configuration);
        const key = wire.json(normalized), nextController = configuration.billing?.mode === 'external' ? configuration.billing.controller : undefined;
        if (configurationKey !== undefined) {
          if (key !== configurationKey || nextController !== controller) throw new NuxieError('alreadyConfigured', 'Nuxie configuration cannot change without explicit shutdown');
          return setup ?? Promise.resolve();
        }
        configurationKey = key; controller = nextController;
        const current = ++epoch;
        setup = Promise.resolve().then(async () => {
          try {
            binding = await load();
            session = `rn-${Date.now()}-${current}-${Math.random().toString(36).slice(2)}`;
            const attachedSession = session;
            detach = binding.module.onEvent(raw => receive(raw, attachedSession)).remove;
            const { apiKeys, ...options } = normalized;
            const response = wire.parse(await binding.module.configure(wire.json({ ...options, contract: 1, session,
              apiKey: apiKeys[binding.platform] })));
            if (current !== epoch) throw new NuxieError('staleOperation', 'Configuration session was replaced');
            if (response.contract !== 1 || response.session !== session) throw new NuxieError('incompatibleBridge', 'Nuxie JavaScript and native module differ. Rebuild the native app.');
            publish(wire.snapshot(response.snapshot));
            setStatus({ state: 'configured', versions: Object.freeze({ wrapper: '0.2.0', native: wire.string(response.nativeVersion), contract: 1 }) });
          } catch (error) {
            detach?.(); detach = undefined;
            session = undefined; configurationKey = undefined; controller = undefined;
            features = EMPTY; notify(snapshots, undefined);
            const failure = asError(error); setStatus({ state: 'failed', error: failure });
            throw failure;
          } finally { if (current === epoch) setup = undefined; }
        });
        setStatus({ state: 'configuring' });
        return setup;
      } catch (error) { return Promise.reject(asError(error)); }
    },
    getStatus: () => status,
    subscribeStatus: listener => subscribe(statuses, listener),
    getFeatures: () => features,
    subscribeFeatures: listener => subscribe(snapshots, listener),
    async identify(customerId, options = {}) {
      wire.text(customerId, 'customerId'); const properties = wire.json(options);
      ++identityEpoch;
      await invoke(c => c.module.identify(c.session, customerId, properties));
    },
    async reset(options = {}) { ++identityEpoch; await invoke(c => c.module.reset(c.session, options.keepAnonymousId ?? false)); },
    getDistinctId: () => invoke(async c => wire.string(wire.parse(await c.module.getIdentity(c.session)).distinctId), true),
    getAnonymousId: () => invoke(async c => wire.string(wire.parse(await c.module.getIdentity(c.session)).anonymousId), true),
    getIsIdentified: () => invoke(async c => wire.bool(wire.parse(await c.module.getIdentity(c.session)).isIdentified), true),
    async setLocaleIdentifier(locale) { if (locale !== null) wire.text(locale, 'locale'); await invoke(c => c.module.setLocaleIdentifier(c.session, locale)); },
    async trigger(event, properties = {}) { wire.text(event, 'event'); const payload = wire.json(properties); await invoke(c => c.module.trigger(c.session, event, payload)); },
    dismiss: () => invoke(c => c.module.dismiss(c.session)),
    async hasFeature(featureId, options = {}) {
      wire.text(featureId, 'featureId'); wire.positive(options.requiredBalance ?? 1);
      if (options.entityId !== undefined) wire.text(options.entityId, 'entityId');
      if (options.policy !== undefined && options.policy !== 'remote' && options.policy !== 'cacheFirst') throw new NuxieError('invalidArgument', 'Unknown Feature query policy');
      return invoke(async c => wire.access(wire.parse(await c.module.hasFeature(c.session, featureId, wire.json(options)))), true);
    },
    async consumeFeature(featureId, options) {
      wire.text(featureId, 'featureId'); wire.text(options.operationId, 'operationId'); wire.positive(options.quantity);
      if (options.entityId !== undefined) wire.text(options.entityId, 'entityId');
      return invoke(async c => {
        const v = wire.parse(await c.module.consumeFeature(c.session, featureId, wire.json(options)));
        const result = { accepted: wire.bool(v.accepted), operationId: wire.string(v.operationId),
          quantity: wire.number(v.quantity), code: wire.string(v.code), idempotentReplay: wire.bool(v.idempotentReplay), balance: wire.nullable(v.balance, wire.number), unlimited: wire.bool(v.unlimited), active: wire.bool(v.active) };
        if (result.operationId !== options.operationId || result.quantity !== options.quantity) wire.invalid('Consumption receipt does not match the command');
        return wire.frozen(result);
      }, true);
    },
    restorePurchases: () => invoke(async c => wire.restore(wire.parse(await c.module.restorePurchases(c.session))), true),
    onActivity: listener => subscribe(activities, listener),
    onAppAction: listener => subscribe(actions, listener),
    onError: listener => subscribe(errors, listener),
    shutdown() {
      if (stopping) return stopping;
      stopping = (async () => {
        await Promise.resolve();
        try {
          if (setup) { try { await setup; } catch { /* Failed setup has no active attachment. */ } }
          if (binding && session) await binding.module.shutdown(session);
          ++epoch; ++identityEpoch;
          detach?.(); detach = undefined; session = undefined; controller = undefined; configurationKey = undefined;
          commerceRequests.clear(); features = EMPTY; notify(snapshots, undefined); setStatus(UNCONFIGURED);
        } catch (error) { throw asError(error); }
        finally { stopping = undefined; }
      })();
      return stopping;
    },
  };
  return Object.freeze(client);
}
function sameAccess(a: FeatureAccess, b: FeatureAccess) { return a.allowed === b.allowed && a.unlimited === b.unlimited && a.balance === b.balance && a.type === b.type; }
function normalize(config: NuxieConfiguration) {
  const environment = config.environment ?? 'production', logLevel = config.logLevel ?? 'warning';
  if (!['production', 'development'].includes(environment) || !['verbose', 'debug', 'info', 'warning', 'error', 'none'].includes(logLevel)) throw new NuxieError('invalidArgument', 'Invalid environment or log level');
  if (config.billing && !['native', 'external'].includes(config.billing.mode)) throw new NuxieError('invalidArgument', 'Invalid billing mode');
  if (config.billing?.mode === 'external' && (typeof config.billing.controller?.purchase !== 'function' || typeof config.billing.controller?.restorePurchases !== 'function')) throw new NuxieError('invalidArgument', 'External billing requires purchase and restorePurchases functions');
  if (config.billing?.mode === 'native' && config.billing.handling !== undefined && !['full', 'observer'].includes(config.billing.handling)) throw new NuxieError('invalidArgument', 'Unknown native purchase handling mode');
  if (config.localeIdentifier != null) wire.text(config.localeIdentifier, 'localeIdentifier');
  return { apiKeys: { ios: wire.text(config.apiKeys.ios, 'iOS API key'), android: wire.text(config.apiKeys.android, 'Android API key') },
    environment, logLevel, localeIdentifier: config.localeIdentifier ?? null,
    purchaseHandlingMode: config.billing?.mode === 'native' ? config.billing.handling ?? 'full' : 'full', externalBilling: config.billing?.mode === 'external' };
}
