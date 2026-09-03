export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type EventProperties = Record<string, JsonValue>;
export type NuxieLogLevel =
  | "verbose"
  | "debug"
  | "info"
  | "warning"
  | "error"
  | "none";
export type NuxieEnvironment = "production" | "development";
export type PurchaseHandlingMode = "full" | "observer";

/** Customer-owned setup values shared by the native SDKs. */
export interface NuxieConfigurationOptions {
  environment?: NuxieEnvironment;
  logLevel?: NuxieLogLevel;
  enableConsoleLogging?: boolean;
  redactSensitiveData?: boolean;
  localeIdentifier?: string | null;
  purchaseHandlingMode?: PurchaseHandlingMode;
  /** iOS development builds only. Ignored on Android. */
  testStoreEnabled?: boolean;
}

export interface NuxieConfigureOptions extends NuxieConfigurationOptions {
  apiKey?: string;
  usePurchaseController?: boolean;
}

export type FeatureCheckPolicy = "cacheFirst" | "remote";
export type FeatureType = "boolean" | "metered" | "creditSystem";

export interface FeatureAccess {
  allowed: boolean;
  unlimited: boolean;
  balance: number | null;
  type: FeatureType;
}

export interface FeatureAccessChangedEvent {
  featureId: string;
  from: FeatureAccess | null;
  to: FeatureAccess;
  timestampMs: number;
}

export interface FeatureUsageResult {
  success: boolean;
  featureId: string;
  amountUsed: number;
  message: string | null;
  usage: {
    current: number;
    limit: number | null;
    remaining: number | null;
  } | null;
  authoritativeAccess: FeatureAccess | null;
}

export interface ExperienceRef {
  experienceId: string;
  experienceVersion: string | null;
  journeyId: string | null;
}

export interface AppAction {
  name: string;
  payload: Record<string, string | number | boolean> | null;
  experience: ExperienceRef;
}

export interface NuxieActivityInfo {
  schemaVersion: 1;
  id: string;
  timestampMs: number;
  receivedAtMs: number;
  name: string;
  properties: Record<string, string | number | boolean>;
}

export interface NuxieNativeError {
  code: string;
  message: string;
  nativeStack?: string;
}

/** Snake-case portable checkout request passed to a custom purchase controller. */
export interface PurchaseRequest {
  request_id: string;
  platform: "ios" | "android";
  product_id: string;
  store_product_id: string;
  base_plan_id: string | null;
  purchase_option_id: string | null;
  offer_id: string | null;
  placement_id: string | null;
  display_name: string | null;
  display_price: string | null;
  timestamp_ms: number;
}

export interface RestoreRequest {
  request_id: string;
  platform: "ios" | "android";
  timestamp_ms: number;
}

export type PurchaseResult =
  | { type: "purchased" }
  | { type: "cancelled" }
  | { type: "pending" }
  | { type: "failed"; message: string };

export type RestoreResult =
  | { type: "restored" }
  | { type: "no_purchases" }
  | { type: "failed"; message: string };

export interface NuxiePurchaseController {
  onPurchase(request: PurchaseRequest): Promise<PurchaseResult>;
  onRestore(request: RestoreRequest): Promise<RestoreResult>;
}
