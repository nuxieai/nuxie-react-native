import type {
  NuxieNativeEventMap,
  NuxieNativeEventName,
  NuxieNativeModule,
  NuxieNativeSubscription,
} from "../native-module";
import type {
  EventProperties,
  FeatureAccess,
  FeatureCheckPolicy,
  FeatureUsageResult,
  NuxieConfigurationOptions,
  PurchaseResult,
  RestoreResult,
} from "../types";

type ListenerMap = {
  [K in NuxieNativeEventName]: Set<(payload: NuxieNativeEventMap[K]) => void>;
};

export class TestNativeModule implements NuxieNativeModule {
  readonly listeners: ListenerMap = {
    onFeatureAccessChanged: new Set(),
    onActivity: new Set(),
    onAppAction: new Set(),
    onPurchaseRequest: new Set(),
    onRestoreRequest: new Set(),
  };

  configureArgs: {
    apiKey: string;
    options?: NuxieConfigurationOptions;
    usePurchaseController?: boolean;
    wrapperVersion?: string;
  } | null = null;
  defaultApiKey: string | null = null;
  triggers: Array<{ eventName: string; properties?: EventProperties }> = [];
  resetValues: boolean[] = [];
  dismissed = 0;
  localeIdentifiers: Array<string | null> = [];
  featureChecks: Array<{
    featureId: string;
    requiredBalance?: number;
    entityId?: string;
    policy?: FeatureCheckPolicy;
  }> = [];
  completedPurchases: Array<{ requestId: string; result: PurchaseResult }> = [];
  completedRestores: Array<{ requestId: string; result: RestoreResult }> = [];

  addListener<K extends NuxieNativeEventName>(
    eventName: K,
    listener: (payload: NuxieNativeEventMap[K]) => void,
  ): NuxieNativeSubscription {
    this.listeners[eventName].add(listener as never);
    return { remove: () => this.listeners[eventName].delete(listener as never) };
  }

  emit<K extends NuxieNativeEventName>(eventName: K, payload: NuxieNativeEventMap[K]): void {
    for (const listener of this.listeners[eventName]) {
      listener(payload as never);
    }
  }

  async configure(
    apiKey: string,
    options?: NuxieConfigurationOptions,
    usePurchaseController?: boolean,
    wrapperVersion?: string,
  ): Promise<void> {
    this.configureArgs = { apiKey, options, usePurchaseController, wrapperVersion };
  }

  async getDefaultApiKey(): Promise<string | null> {
    return this.defaultApiKey;
  }

  async shutdown(): Promise<void> {}
  async identify(): Promise<void> {}

  async reset(keepAnonymousId = false): Promise<void> {
    this.resetValues.push(keepAnonymousId);
  }

  async getDistinctId(): Promise<string> {
    return "distinct_123";
  }

  async getAnonymousId(): Promise<string> {
    return "anon_123";
  }

  async getIsIdentified(): Promise<boolean> {
    return true;
  }

  trigger(eventName: string, properties?: EventProperties): void {
    this.triggers.push({ eventName, properties });
  }

  async dismiss(): Promise<void> {
    this.dismissed += 1;
  }

  async setLocaleIdentifier(localeIdentifier: string | null): Promise<void> {
    this.localeIdentifiers.push(localeIdentifier);
  }

  async hasFeature(
    featureId: string,
    requiredBalance?: number,
    entityId?: string,
    policy?: FeatureCheckPolicy,
  ): Promise<FeatureAccess> {
    this.featureChecks.push({ featureId, requiredBalance, entityId, policy });
    return { allowed: true, unlimited: false, balance: 3.5, type: "metered" };
  }

  async useFeature(): Promise<void> {}

  async useFeatureAndWait(): Promise<FeatureUsageResult> {
    return {
      success: true,
      featureId: "f_1",
      amountUsed: 1.5,
      message: null,
      usage: { current: 2.5, limit: 10.5, remaining: 8 },
      authoritativeAccess: {
        allowed: true,
        unlimited: false,
        balance: 8,
        type: "creditSystem",
      },
    };
  }

  async completePurchase(requestId: string, result: PurchaseResult): Promise<void> {
    this.completedPurchases.push({ requestId, result });
  }

  async completeRestore(requestId: string, result: RestoreResult): Promise<void> {
    this.completedRestores.push({ requestId, result });
  }
}
