import { NuxieError } from './errors';
import type { AppAction, FeatureAccess, FeatureSnapshot, JsonObject, NuxieActivity, RestoreResult, StoreProduct } from './types';

export function invalid(message: string): never { throw new NuxieError('invalidPayload', message); }
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid('Expected an object');
  return value as Record<string, unknown>;
}
export function string(value: unknown): string { return typeof value === 'string' ? value : invalid('Expected a string'); }
export function bool(value: unknown): boolean { return typeof value === 'boolean' ? value : invalid('Expected a boolean'); }
export function number(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? value : invalid('Expected a finite number'); }
export function nullable<T>(value: unknown, parse: (input: unknown) => T): T | null { return value == null ? null : parse(value); }
export function text(value: string, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new NuxieError('invalidArgument', `${name} must be a non-empty string`);
  return value;
}
export function positive(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new NuxieError('invalidArgument', 'Quantity and required balance must be positive safe integers');
  return value;
}
export function json(value: unknown): string {
  const seen = new Set<unknown>();
  function check(input: unknown): void {
    if (input === null || typeof input === 'string' || typeof input === 'boolean') return;
    if (typeof input === 'number' && Number.isFinite(input)) return;
    if (typeof input !== 'object' || seen.has(input)) throw new NuxieError('invalidArgument', 'Properties must contain finite JSON values without cycles');
    if (!Array.isArray(input) && Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null) throw new NuxieError('invalidArgument', 'Properties must contain plain JSON objects');
    seen.add(input);
    Object.values(input).forEach(check);
    seen.delete(input);
  }
  check(value);
  return JSON.stringify(value);
}
export function parse(value: string): Record<string, unknown> { return object(JSON.parse(value)); }
export function frozen<T>(value: T): T {
  if (value !== null && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); }
  return value;
}
export function access(value: unknown): FeatureAccess {
  const v = object(value); const type = string(v.type);
  if (type !== 'boolean' && type !== 'metered' && type !== 'creditSystem') return invalid('Unknown Feature type');
  return frozen({ allowed: bool(v.allowed), unlimited: bool(v.unlimited), balance: nullable(v.balance, number), type });
}
function counter(value: unknown): string { const v = string(value); return /^(0|[1-9]\d*)$/.test(v) ? v : invalid('Invalid native counter'); }
export function snapshot(value: unknown): FeatureSnapshot {
  const v = object(value); const state = string(v.state);
  if (state !== 'unknown' && state !== 'ready' && state !== 'reconciling') return invalid('Unknown Feature state');
  return frozen({ state, identityGeneration: counter(v.identityGeneration), revision: counter(v.revision),
    all: Object.fromEntries(Object.entries(object(v.all)).map(([key, value]) => [key, access(value)])) });
}
export function restore(value: unknown): RestoreResult {
  const v = object(value);
  if (v.type === 'restored' || v.type === 'noPurchases') return { type: v.type };
  if (v.type === 'failed') return { type: 'failed', message: string(v.message) };
  return invalid('Unknown restore outcome');
}
function properties(value: unknown): JsonObject { const v = object(value); json(v); return frozen(v as JsonObject); }
export function activity(value: unknown): NuxieActivity {
  const v = object(value);
  return frozen({ schemaVersion: number(v.schemaVersion), id: string(v.id), timestampMs: number(v.timestampMs),
    receivedAtMs: number(v.receivedAtMs), name: string(v.name), properties: properties(v.properties) });
}
export function action(value: unknown): AppAction {
  const v = object(value), e = object(v.experience);
  return frozen({ name: string(v.name), payload: nullable(v.payload, properties), experience: {
    experienceId: string(e.experienceId), experienceVersion: nullable(e.experienceVersion, string), journeyId: nullable(e.journeyId, string) } });
}
export function product(value: unknown): StoreProduct {
  const v = object(value), platform = string(v.platform);
  if (platform !== 'ios' && platform !== 'android') return invalid('Invalid product platform');
  const term = nullable(v.introductoryTerms, object);
  return frozen({ platform, productId: string(v.productId), storeProductId: string(v.storeProductId),
    basePlanId: nullable(v.basePlanId, string), purchaseOptionId: nullable(v.purchaseOptionId, string), offerId: nullable(v.offerId, string),
    placementId: nullable(v.placementId, string), displayName: nullable(v.displayName, string), description: nullable(v.description, string),
    displayPrice: nullable(v.displayPrice, string), productType: nullable(v.productType, string), period: nullable(v.period, string),
    periodCount: nullable(v.periodCount, number), billingPlan: nullable(v.billingPlan, string), eligibilityJws: nullable(v.eligibilityJws, string),
    pricingPhases: nullable(v.pricingPhases, input => {
      if (!Array.isArray(input)) return invalid('Expected pricing phases');
      return input.map(value => { const phase = object(value); return { displayPrice: string(phase.displayPrice), billingPeriod: string(phase.billingPeriod), billingCycleCount: number(phase.billingCycleCount), recurrenceMode: number(phase.recurrenceMode) }; });
    }),
    introductoryTerms: term && { price: string(term.price), period: string(term.period), periodCount: number(term.periodCount),
      cycles: number(term.cycles), paymentMode: string(term.paymentMode), displayDuration: string(term.displayDuration) } });
}
