import type { Spec } from '../src/specs/NativeNuxie';
import type { FeatureSnapshot } from '../src/types';
export const empty = { state: 'unknown', all: {}, identityGeneration: '0', revision: '0' } as const;
export function fixture() {
  let session = '';
  const listeners = new Set<(value: string) => void>();
  const calls: { method: string; args: unknown[] }[] = [];
  const record = (method: string, ...args: unknown[]) => { calls.push({ method, args }); };
  const module: Spec = {
    configure: async input => {
      record('configure', input); session = JSON.parse(input).session;
      return JSON.stringify({ contract: 1, session, nativeVersion: 'native-test', snapshot: empty });
    },
    shutdown: async (...args) => record('shutdown', ...args),
    identify: async (...args) => record('identify', ...args),
    reset: async (...args) => record('reset', ...args),
    getIdentity: async () => JSON.stringify({ distinctId: 'customer', anonymousId: 'anon', isIdentified: true }),
    setLocaleIdentifier: async (...args) => record('locale', ...args),
    trigger: async (...args) => record('trigger', ...args),
    dismiss: async (...args) => record('dismiss', ...args),
    hasFeature: async (...args) => { record('hasFeature', ...args); return JSON.stringify({ allowed: true, unlimited: false, balance: 1, type: 'metered' }); },
    consumeFeature: async (_session, _feature, options) => JSON.stringify({ ...JSON.parse(options), accepted: true, code: 'accepted', balance: 0, unlimited: false, active: false, idempotentReplay: false }),
    restorePurchases: async () => JSON.stringify({ type: 'noPurchases' }),
    completePurchase: async (...args) => record('completePurchase', ...args),
    completeRestore: async (...args) => record('completeRestore', ...args),
    onEvent: listener => { listeners.add(listener); return { remove: () => { listeners.delete(listener); } }; },
  };
  return { module, calls, listeners, emit(name: string, payload: unknown, override = session) {
    for (const listener of listeners) listener(JSON.stringify({ session: override, name, payload }));
  }, snapshot(snapshot: FeatureSnapshot) { this.emit('features', snapshot); } };
}
export const config = { apiKeys: { ios: 'pk-ios', android: 'pk-android' } } as const;
export function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
