import { describe, expect, test } from 'bun:test';
import { createClient } from '../src/client';
import { config, deferred, empty, fixture } from './native-fixture';

function harness() { const native = fixture(); return { native, client: createClient(async () => ({ module: native.module, platform: 'ios' })) }; }
const meter = { allowed: true, unlimited: false, balance: 1, type: 'metered' } as const;
describe('client lifecycle', () => {
  test('identical concurrent setup shares work, conflicting setup fails', async () => {
    const { native, client } = harness();
    const first = client.configure(config), second = client.configure({ ...config });
    expect(first).toBe(second); await first;
    expect(native.calls.filter(c => c.method === 'configure')).toHaveLength(1);
    expect(client.getStatus().state).toBe('configured');
    await expect(client.configure({ ...config, environment: 'development' })).rejects.toMatchObject({ code: 'alreadyConfigured' });
  });
  test('subscribes before native startup, fences initial snapshot behind newer event', async () => {
    const { native, client } = harness(), configure = native.module.configure;
    native.module.configure = async input => {
      const response = await configure(input);
      native.snapshot({ ...empty, revision: '9007199254740993', state: 'ready', all: { premium: meter } });
      return response;
    };
    await client.configure(config);
    expect(client.getFeatures().all.premium).toEqual(meter);
    expect(client.getFeatures().revision).toBe('9007199254740993');
  });
  test('failed setup detaches and permits deliberate retry', async () => {
    const { native, client } = harness(), configure = native.module.configure;
    native.module.configure = async () => { throw new Error('offline'); };
    await expect(client.configure(config)).rejects.toThrow('offline');
    expect(client.getStatus().state).toBe('failed'); expect(native.listeners.size).toBe(0);
    native.module.configure = configure; await client.configure(config);
    expect(client.getStatus().state).toBe('configured');
  });
  test('shutdown works before setup and permits new configuration afterwards', async () => {
    const { native, client } = harness();
    await client.shutdown(); await client.configure(config); await client.shutdown();
    expect(native.listeners.size).toBe(0); expect(client.getStatus().state).toBe('unconfigured');
    await client.configure({ ...config, environment: 'development' });
    expect(client.getStatus().state).toBe('configured');
  });
  test('imports public API without loading a native runtime', async () => {
    const api = await import('../src/index'); expect(api.nuxie.getStatus().state).toBe('unconfigured');
  });
});
describe('Feature authority', () => {
  test('immutable snapshots preserve unchanged selected Feature references', async () => {
    const { native, client } = harness(); await client.configure(config);
    native.snapshot({ ...empty, revision: '1', state: 'ready', all: { a: meter } });
    const first = client.getFeatures();
    native.snapshot({ ...empty, revision: '2', state: 'ready', all: { a: meter, b: meter } });
    expect(client.getFeatures().all.a).toBe(first.all.a);
    expect(Object.isFrozen(first.all.a)).toBe(true);
    native.snapshot({ ...empty, revision: '1', state: 'ready', all: {} });
    expect(client.getFeatures().all.b).toEqual(meter);
    native.emit('features', { ...empty, revision: '3', state: 'ready', all: {} }, 'old-runtime');
    expect(client.getFeatures().all.b).toEqual(meter);
  });
  test('an identity transition rejects delayed scoped reads', async () => {
    const { native, client } = harness(); await client.configure(config);
    const response = deferred<string>(); native.module.hasFeature = () => response.promise;
    const request = client.hasFeature('a', { entityId: 'entity-a' });
    await client.identify('customer-b'); response.resolve(JSON.stringify(meter));
    await expect(request).rejects.toMatchObject({ code: 'staleOperation' });
    expect(client.getFeatures().all).toEqual({});
  });
  test('consumption preserves stable command ID and accepts committed last unit', async () => {
    const { client } = harness(); await client.configure(config);
    const result = await client.consumeFeature('exports', { quantity: 1, operationId: 'export-42' });
    expect(result.accepted).toBe(true); expect(result.active).toBe(false); expect(result.balance).toBe(0);
    expect(result.operationId).toBe('export-42');
  });
  test('rejects fractional, unsafe, nonfinite or cyclic application input before native call', async () => {
    const { native, client } = harness(); await client.configure(config);
    await expect(client.hasFeature('a', { requiredBalance: 0.5 })).rejects.toMatchObject({ code: 'invalidArgument' });
    await expect(client.consumeFeature('a', { quantity: Number.MAX_SAFE_INTEGER + 1, operationId: 'op' })).rejects.toMatchObject({ code: 'invalidArgument' });
    await expect(client.trigger('event', { amount: NaN })).rejects.toMatchObject({ code: 'invalidArgument' });
    const cyclic: Record<string, never> = {}; Object.defineProperty(cyclic, 'cycle', { value: cyclic, enumerable: true });
    await expect(client.trigger('event', cyclic)).rejects.toMatchObject({ code: 'invalidArgument' });
    expect(native.calls).toHaveLength(1);
  });
});
describe('events and commerce', () => {
  test('one throwing observer does not prevent other observers receiving activity', async () => {
    const { native, client } = harness(); await client.configure(config);
    let received = 0, errors = 0;
    client.onError(() => { errors++; }); client.onActivity(() => { throw Error('app listener'); }); client.onActivity(() => { received++; });
    native.emit('activity', { schemaVersion: 1, id: 'a', name: 'experience_shown', timestampMs: 0, receivedAtMs: 1, properties: {} });
    expect(received).toBe(1); expect(errors).toBe(1);
  });
  test('external restore settles once, hiding transport IDs from the controller', async () => {
    const { native, client } = harness(); let restores = 0;
    await client.configure({ ...config, billing: { mode: 'external', controller: {
      purchase: async () => ({ type: 'cancelled' }), restorePurchases: async () => { restores++; return { type: 'noPurchases' }; },
    } } });
    native.emit('restore', { requestId: 'r1' }); native.emit('restore', { requestId: 'r1' });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(restores).toBe(1); expect(native.calls.filter(c => c.method === 'completeRestore')).toHaveLength(1);
    expect(native.calls.at(-1)?.args[2]).toBe('{"type":"noPurchases"}');
  });
});

test('reentrant configuration from a status observer shares the pending promise', async () => {
  const { client } = harness(); let nested: Promise<void> | undefined;
  client.subscribeStatus(() => { if (client.getStatus().state === 'configuring') nested = client.configure(config); });
  const setup = client.configure(config); expect(nested).toBe(setup); await setup;
});

test('external purchases retain exact selected offer and settle each outcome once', async () => {
  const { native, client } = harness();
  const product = { platform: 'android', productId: 'nuxie-product', storeProductId: 'play-product',
    basePlanId: 'annual', offerId: 'intro-2026', purchaseOptionId: null, placementId: 'paywall',
    displayName: 'Premium', description: null, displayPrice: '$0.00', productType: 'subscription',
    period: 'year', periodCount: 1, billingPlan: null, eligibilityJws: 'signed-eligibility', introductoryTerms: null,
    pricingPhases: [{ displayPrice: '$0.00', billingPeriod: 'P1W', billingCycleCount: 1, recurrenceMode: 2 },
      { displayPrice: '$49.99', billingPeriod: 'P1Y', billingCycleCount: 0, recurrenceMode: 1 }] };
  let calls = 0;
  const outcomes = [{ type: 'purchased' }, { type: 'cancelled' }, { type: 'pending' }, { type: 'failed', message: 'Declined' }] as const;
  await client.configure({ ...config, billing: { mode: 'external', controller: {
    purchase: async selected => { expect(selected).toEqual(product); expect(Object.isFrozen(selected.pricingPhases)).toBe(true); return outcomes[calls++]; },
    restorePurchases: async () => ({ type: 'noPurchases' }),
  } } });
  for (let i = 0; i < outcomes.length; i++) {
    native.emit('purchase', { requestId: `p${i}`, product });
    native.emit('purchase', { requestId: `p${i}`, product });
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  expect(calls).toBe(4);
  expect(native.calls.filter(c => c.method === 'completePurchase').map(c => JSON.parse(String(c.args[2])))).toEqual(outcomes);
});

test('a controller rejection becomes a failed native completion without leaking its exception', async () => {
  const { native, client } = harness();
  await client.configure({ ...config, billing: { mode: 'external', controller: {
    purchase: async () => ({ type: 'cancelled' }), restorePurchases: async () => { throw new Error('private vendor diagnostics'); },
  } } });
  native.emit('restore', { requestId: 'failure' });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(native.calls.at(-1)?.args[2]).toBe('{"type":"failed","message":"External purchase controller failed"}');
});
