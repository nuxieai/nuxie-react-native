/** JSON values accepted by event properties and identity attributes. */
export type JsonValue = string | number | boolean | null | readonly JsonValue[] | JsonObject;
export type JsonObject = { readonly [key: string]: JsonValue };
export type Unsubscribe = () => void;
export type FeatureState = 'unknown' | 'reconciling' | 'ready';
export interface FeatureAccess {
  readonly allowed: boolean;
  readonly unlimited: boolean;
  readonly balance: number | null;
  readonly type: 'boolean' | 'metered' | 'creditSystem';
}
export interface FeatureSnapshot {
  readonly state: FeatureState;
  readonly all: Readonly<Record<string, FeatureAccess>>;
  /** Native unsigned counters are decimal strings, preserving full precision. */
  readonly identityGeneration: string;
  readonly revision: string;
}
export interface FeatureSelection { readonly state: FeatureState; readonly access: FeatureAccess | null }
export interface NuxieVersions { readonly wrapper: string; readonly native: string; readonly contract: number }
export type NuxieStatus =
  | { readonly state: 'unconfigured' | 'configuring' }
  | { readonly state: 'configured'; readonly versions: NuxieVersions }
  | { readonly state: 'failed'; readonly error: Error };
export type PurchaseResult = { type: 'purchased' | 'cancelled' | 'pending' } | { type: 'failed'; message: string };
export type RestoreResult = { type: 'restored' | 'noPurchases' } | { type: 'failed'; message: string };
export interface StoreProduct {
  readonly platform: 'ios' | 'android';
  readonly productId: string;
  readonly storeProductId: string;
  readonly basePlanId: string | null;
  readonly purchaseOptionId: string | null;
  readonly offerId: string | null;
  readonly placementId: string | null;
  readonly displayName: string | null;
  readonly description: string | null;
  readonly displayPrice: string | null;
  readonly productType: string | null;
  readonly period: string | null;
  readonly periodCount: number | null;
  readonly billingPlan: string | null;
  readonly eligibilityJws: string | null;
  /** Selected Play subscription offer phases, in billing order. Null on iOS or one-time products. */
  readonly pricingPhases: readonly { readonly displayPrice: string; readonly billingPeriod: string; readonly billingCycleCount: number; readonly recurrenceMode: number }[] | null;
  readonly introductoryTerms: {
    readonly price: string; readonly period: string; readonly periodCount: number;
    readonly cycles: number; readonly paymentMode: string; readonly displayDuration: string;
  } | null;
}
export interface PurchaseController {
  purchase(product: StoreProduct): Promise<PurchaseResult>;
  restorePurchases(): Promise<RestoreResult>;
}
export interface NuxieConfiguration {
  readonly apiKeys: { readonly ios: string; readonly android: string };
  readonly environment?: 'production' | 'development';
  readonly logLevel?: 'verbose' | 'debug' | 'info' | 'warning' | 'error' | 'none';
  readonly localeIdentifier?: string | null;
  readonly billing?: { readonly mode: 'native'; readonly handling?: 'full' | 'observer' }
    | { readonly mode: 'external'; readonly controller: PurchaseController };
}
export interface IdentifyOptions { readonly properties?: JsonObject; readonly propertiesSetOnce?: JsonObject }
export interface FeatureCheckOptions {
  readonly requiredBalance?: number;
  readonly entityId?: string;
  readonly policy?: 'cacheFirst' | 'remote';
}
export interface ConsumeFeatureOptions { readonly quantity: number; readonly operationId: string; readonly entityId?: string }
export interface FeatureConsumption {
  readonly accepted: boolean;
  readonly operationId: string;
  readonly quantity: number;
  readonly code: string;
  readonly idempotentReplay: boolean;
  readonly balance: number | null;
  readonly unlimited: boolean;
  readonly active: boolean;
}
export interface NuxieActivity {
  readonly schemaVersion: number; readonly id: string; readonly timestampMs: number;
  readonly receivedAtMs: number; readonly name: string; readonly properties: JsonObject;
}
export interface AppAction {
  readonly name: string;
  readonly payload: JsonObject | null;
  readonly experience: { readonly experienceId: string; readonly experienceVersion: string | null; readonly journeyId: string | null };
}
export interface NuxieClient {
  configure(configuration: NuxieConfiguration): Promise<void>;
  getStatus(): NuxieStatus;
  subscribeStatus(listener: () => void): Unsubscribe;
  getFeatures(): FeatureSnapshot;
  subscribeFeatures(listener: () => void): Unsubscribe;
  identify(customerId: string, options?: IdentifyOptions): Promise<void>;
  reset(options?: { keepAnonymousId?: boolean }): Promise<void>;
  getDistinctId(): Promise<string>;
  getAnonymousId(): Promise<string>;
  getIsIdentified(): Promise<boolean>;
  setLocaleIdentifier(locale: string | null): Promise<void>;
  trigger(event: string, properties?: JsonObject): Promise<void>;
  dismiss(): Promise<void>;
  hasFeature(featureId: string, options?: FeatureCheckOptions): Promise<FeatureAccess>;
  consumeFeature(featureId: string, options: ConsumeFeatureOptions): Promise<FeatureConsumption>;
  restorePurchases(): Promise<RestoreResult>;
  onActivity(listener: (activity: NuxieActivity) => void): Unsubscribe;
  onAppAction(listener: (action: AppAction) => void): Unsubscribe;
  onError(listener: (error: Error) => void): Unsubscribe;
  shutdown(): Promise<void>;
}
