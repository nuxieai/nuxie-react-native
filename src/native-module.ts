import type {
  AppAction,
  EventProperties,
  FeatureAccess,
  FeatureCheckPolicy,
  FeatureUsageResult,
  NuxieActivityInfo,
  NuxieConfigurationOptions,
  PurchaseRequest,
  PurchaseResult,
  RestoreRequest,
  RestoreResult,
} from "./types";

export type NuxieNativeEventMap = {
  onFeatureAccessChanged: {
    featureId: string;
    from: FeatureAccess | null;
    to: FeatureAccess;
    timestampMs: number;
  };
  onActivity: NuxieActivityInfo;
  onAppAction: AppAction;
  onPurchaseRequest: PurchaseRequest;
  onRestoreRequest: RestoreRequest;
};

export type NuxieNativeEventName = keyof NuxieNativeEventMap;

export interface NuxieNativeSubscription {
  remove(): void;
}

export interface NuxieNativeModule {
  getDefaultApiKey(): Promise<string | null>;
  configure(
    apiKey: string,
    options?: NuxieConfigurationOptions,
    usePurchaseController?: boolean,
    wrapperVersion?: string,
  ): Promise<void>;
  shutdown(): Promise<void>;
  identify(
    distinctId: string,
    userProperties?: Record<string, unknown>,
    userPropertiesSetOnce?: Record<string, unknown>,
  ): Promise<void>;
  reset(keepAnonymousId?: boolean): Promise<void>;
  getDistinctId(): Promise<string>;
  getAnonymousId(): Promise<string>;
  getIsIdentified(): Promise<boolean>;
  trigger(eventName: string, properties?: EventProperties): void;
  dismiss(): Promise<void>;
  setLocaleIdentifier(localeIdentifier: string | null): Promise<void>;
  hasFeature(
    featureId: string,
    requiredBalance?: number,
    entityId?: string,
    policy?: FeatureCheckPolicy,
  ): Promise<FeatureAccess>;
  useFeature(
    featureId: string,
    amount?: number,
    entityId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void>;
  useFeatureAndWait(
    featureId: string,
    amount?: number,
    entityId?: string,
    setUsage?: boolean,
    metadata?: Record<string, unknown>,
  ): Promise<FeatureUsageResult>;
  completePurchase(requestId: string, result: PurchaseResult): Promise<void>;
  completeRestore(requestId: string, result: RestoreResult): Promise<void>;
  addListener<K extends NuxieNativeEventName>(
    eventName: K,
    listener: (payload: NuxieNativeEventMap[K]) => void,
  ): NuxieNativeSubscription;
}

let nativeModuleCache: NuxieNativeModule | null = null;

async function resolveExpoNativeModule(): Promise<NuxieNativeModule | null> {
  try {
    const expo = await import("expo");
    const requireNativeModule = (expo as { requireNativeModule?: <T>(name: string) => T }).requireNativeModule;
    if (typeof requireNativeModule !== "function") {
      return null;
    }
    return requireNativeModule<NuxieNativeModule>("NuxieExpo");
  } catch {
    return null;
  }
}

async function resolveReactNativeBridge(): Promise<NuxieNativeModule | null> {
  try {
    const reactNative = (await import("react-native")) as {
      NativeModules?: Record<string, unknown>;
      NativeEventEmitter?: new (nativeModule: unknown) => {
        addListener(eventName: string, callback: (payload: unknown) => void): { remove: () => void };
      };
    };

    const nativeModule = (reactNative.NativeModules?.NuxieExpo as NuxieNativeModule | undefined) ?? null;
    if (nativeModule == null) {
      return null;
    }
    if (typeof nativeModule.addListener === "function") {
      return nativeModule;
    }

    if (reactNative.NativeEventEmitter == null) {
      return null;
    }

    const emitter = new reactNative.NativeEventEmitter(nativeModule);
    return {
      ...nativeModule,
      addListener(eventName, listener) {
        const subscription = emitter.addListener(eventName, listener as (payload: unknown) => void);
        return { remove: () => subscription.remove() };
      },
    };
  } catch {
    return null;
  }
}

export async function resolveNativeModule(): Promise<NuxieNativeModule> {
  if (nativeModuleCache != null) {
    return nativeModuleCache;
  }

  const viaExpo = await resolveExpoNativeModule();
  if (viaExpo != null) {
    nativeModuleCache = viaExpo;
    return viaExpo;
  }

  const viaReactNative = await resolveReactNativeBridge();
  if (viaReactNative != null) {
    nativeModuleCache = viaReactNative;
    return viaReactNative;
  }

  throw new Error(
    "Nuxie native bridge (NuxieExpo) is unavailable. Ensure @nuxie/react-native is linked in your app.",
  );
}

export function setNativeModuleForTesting(module: NuxieNativeModule | null): void {
  nativeModuleCache = module;
}
