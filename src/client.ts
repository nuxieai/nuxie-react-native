import type {
  AppAction,
  EventProperties,
  FeatureAccess,
  FeatureAccessChangedEvent,
  FeatureCheckPolicy,
  FeatureUsageResult,
  NuxieActivityInfo,
  NuxieConfigureOptions,
  NuxieConfigurationOptions,
  NuxiePurchaseController,
  PurchaseRequest,
  RestoreRequest,
} from "./types";
import type {
  NuxieNativeEventMap,
  NuxieNativeEventName,
  NuxieNativeModule,
  NuxieNativeSubscription,
} from "./native-module";
import { resolveNativeModule } from "./native-module";

const WRAPPER_VERSION = "0.1.0";

export interface NuxieClientEventMap {
  featureAccessChanged: FeatureAccessChangedEvent;
  activity: NuxieActivityInfo;
  appAction: AppAction;
  purchaseRequest: PurchaseRequest;
  restoreRequest: RestoreRequest;
}

type ClientEventName = keyof NuxieClientEventMap;
type ClientListenerMap = {
  [K in ClientEventName]: Set<(payload: NuxieClientEventMap[K]) => void>;
};
type NuxieClientErrorCode = "MISSING_API_KEY";

const CLIENT_TO_NATIVE_EVENT: Record<ClientEventName, NuxieNativeEventName> = {
  featureAccessChanged: "onFeatureAccessChanged",
  activity: "onActivity",
  appAction: "onAppAction",
  purchaseRequest: "onPurchaseRequest",
  restoreRequest: "onRestoreRequest",
};

function createClientError(code: NuxieClientErrorCode, message: string): Error & { code: NuxieClientErrorCode } {
  const error = new Error(message) as Error & { code: NuxieClientErrorCode };
  error.code = code;
  return error;
}

function toNativeConfiguration(options: NuxieConfigureOptions): NuxieConfigurationOptions {
  const { apiKey: _apiKey, usePurchaseController: _usePurchaseController, ...configuration } = options;
  return configuration;
}

export class NuxieClient {
  private readonly moduleResolver: () => Promise<NuxieNativeModule>;
  private modulePromise: Promise<NuxieNativeModule> | null = null;
  private nativeModule: NuxieNativeModule | null = null;
  private nativeSubscriptions = new Map<NuxieNativeEventName, NuxieNativeSubscription>();
  private nativeSubscriptionPromises = new Map<NuxieNativeEventName, Promise<void>>();
  private purchaseController: NuxiePurchaseController | null = null;
  private configured = false;
  private configuring = false;
  private readonly listeners: ClientListenerMap = {
    featureAccessChanged: new Set(),
    activity: new Set(),
    appAction: new Set(),
    purchaseRequest: new Set(),
    restoreRequest: new Set(),
  };

  constructor(moduleResolver: () => Promise<NuxieNativeModule> = resolveNativeModule) {
    this.moduleResolver = moduleResolver;
  }

  get isConfigured(): boolean {
    return this.configured;
  }

  get isConfiguring(): boolean {
    return this.configuring;
  }

  on<K extends ClientEventName>(
    eventName: K,
    listener: (payload: NuxieClientEventMap[K]) => void,
  ): () => void {
    this.listeners[eventName].add(listener);
    void this.ensureNativeSubscription(CLIENT_TO_NATIVE_EVENT[eventName]);
    return () => {
      this.listeners[eventName].delete(listener);
    };
  }

  setPurchaseController(controller: NuxiePurchaseController | null): void {
    this.purchaseController = controller;
    if (controller != null) {
      void this.ensureNativeSubscription("onPurchaseRequest");
      void this.ensureNativeSubscription("onRestoreRequest");
    }
  }

  private async module(): Promise<NuxieNativeModule> {
    if (this.nativeModule != null) {
      return this.nativeModule;
    }
    if (this.modulePromise == null) {
      this.modulePromise = this.moduleResolver();
    }
    const module = await this.modulePromise;
    this.nativeModule = module;
    return module;
  }

  private emit<K extends ClientEventName>(eventName: K, payload: NuxieClientEventMap[K]): void {
    for (const listener of this.listeners[eventName]) {
      listener(payload);
    }
  }

  private async ensureNativeSubscription(eventName: NuxieNativeEventName): Promise<void> {
    if (this.nativeSubscriptions.has(eventName)) {
      return;
    }
    const pending = this.nativeSubscriptionPromises.get(eventName);
    if (pending != null) {
      await pending;
      return;
    }
    const createPromise = (async () => {
      const module = await this.module();
      if (this.nativeSubscriptions.has(eventName)) {
        return;
      }
      const subscription = module.addListener(eventName, (payload) => {
        this.routeNativeEvent(eventName, payload);
      });
      this.nativeSubscriptions.set(eventName, subscription);
    })();
    this.nativeSubscriptionPromises.set(eventName, createPromise);
    try {
      await createPromise;
    } finally {
      this.nativeSubscriptionPromises.delete(eventName);
    }
  }

  private routeNativeEvent(eventName: NuxieNativeEventName, payload: NuxieNativeEventMap[NuxieNativeEventName]): void {
    switch (eventName) {
      case "onFeatureAccessChanged":
        this.emit("featureAccessChanged", payload as NuxieNativeEventMap["onFeatureAccessChanged"]);
        return;
      case "onActivity":
        this.emit("activity", payload as NuxieNativeEventMap["onActivity"]);
        return;
      case "onAppAction":
        this.emit("appAction", payload as NuxieNativeEventMap["onAppAction"]);
        return;
      case "onPurchaseRequest": {
        const request = payload as NuxieNativeEventMap["onPurchaseRequest"];
        this.emit("purchaseRequest", request);
        void this.handlePurchaseRequest(request);
        return;
      }
      case "onRestoreRequest": {
        const request = payload as NuxieNativeEventMap["onRestoreRequest"];
        this.emit("restoreRequest", request);
        void this.handleRestoreRequest(request);
        return;
      }
    }
  }

  private async handlePurchaseRequest(payload: PurchaseRequest): Promise<void> {
    const controller = this.purchaseController;
    if (controller == null) {
      return;
    }
    const module = await this.module();
    try {
      const result = await controller.onPurchase(payload);
      await module.completePurchase(payload.request_id, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "purchase_failed";
      await module.completePurchase(payload.request_id, { type: "failed", message });
    }
  }

  private async handleRestoreRequest(payload: RestoreRequest): Promise<void> {
    const controller = this.purchaseController;
    if (controller == null) {
      return;
    }
    const module = await this.module();
    try {
      const result = await controller.onRestore(payload);
      await module.completeRestore(payload.request_id, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "restore_failed";
      await module.completeRestore(payload.request_id, { type: "failed", message });
    }
  }

  async configure(options: NuxieConfigureOptions): Promise<void> {
    this.configuring = true;
    try {
      const module = await this.module();
      const explicitApiKey = options.apiKey?.trim();
      const defaultApiKey =
        explicitApiKey == null || explicitApiKey.length === 0
          ? await module.getDefaultApiKey().catch(() => null)
          : null;
      const apiKey = explicitApiKey && explicitApiKey.length > 0 ? explicitApiKey : defaultApiKey?.trim();
      if (apiKey == null || apiKey.length === 0) {
        throw createClientError(
          "MISSING_API_KEY",
          "Nuxie API key is required. Pass apiKey to configure() or set NUXIE_API_KEY via the Expo config plugin.",
        );
      }

      const usePurchaseController = options.usePurchaseController === true || this.purchaseController != null;
      await module.configure(apiKey, toNativeConfiguration(options), usePurchaseController, WRAPPER_VERSION);
      await Promise.all([
        this.ensureNativeSubscription("onFeatureAccessChanged"),
        this.ensureNativeSubscription("onActivity"),
        this.ensureNativeSubscription("onAppAction"),
      ]);
      if (usePurchaseController) {
        await Promise.all([
          this.ensureNativeSubscription("onPurchaseRequest"),
          this.ensureNativeSubscription("onRestoreRequest"),
        ]);
      }
      this.configured = true;
    } finally {
      this.configuring = false;
    }
  }

  async shutdown(): Promise<void> {
    const module = await this.module();
    await module.shutdown();
    this.configured = false;
    this.configuring = false;
    this.nativeSubscriptionPromises.clear();
    for (const subscription of this.nativeSubscriptions.values()) {
      subscription.remove();
    }
    this.nativeSubscriptions.clear();
  }

  async identify(
    distinctId: string,
    options?: {
      userProperties?: Record<string, unknown>;
      userPropertiesSetOnce?: Record<string, unknown>;
    },
  ): Promise<void> {
    const module = await this.module();
    await module.identify(distinctId, options?.userProperties, options?.userPropertiesSetOnce);
  }

  async reset(options?: { keepAnonymousId?: boolean }): Promise<void> {
    const module = await this.module();
    await module.reset(options?.keepAnonymousId ?? false);
  }

  async getDistinctId(): Promise<string> {
    return (await this.module()).getDistinctId();
  }

  async getAnonymousId(): Promise<string> {
    return (await this.module()).getAnonymousId();
  }

  async isIdentified(): Promise<boolean> {
    return (await this.module()).getIsIdentified();
  }

  /** Capture an event. Any matching Journey runs asynchronously in native code. */
  trigger(eventName: string, properties?: EventProperties): void {
    if (!this.configured || this.nativeModule == null) {
      return;
    }
    this.nativeModule.trigger(eventName, properties);
  }

  async dismiss(): Promise<void> {
    await (await this.module()).dismiss();
  }

  async setLocaleIdentifier(localeIdentifier: string | null): Promise<void> {
    await (await this.module()).setLocaleIdentifier(localeIdentifier);
  }

  async hasFeature(
    featureId: string,
    options?: { requiredBalance?: number; entityId?: string; policy?: FeatureCheckPolicy },
  ): Promise<FeatureAccess> {
    return (await this.module()).hasFeature(
      featureId,
      options?.requiredBalance,
      options?.entityId,
      options?.policy,
    );
  }

  async useFeature(
    featureId: string,
    options?: { amount?: number; entityId?: string; metadata?: Record<string, unknown> },
  ): Promise<void> {
    await (await this.module()).useFeature(featureId, options?.amount, options?.entityId, options?.metadata);
  }

  async useFeatureAndWait(
    featureId: string,
    options?: { amount?: number; entityId?: string; setUsage?: boolean; metadata?: Record<string, unknown> },
  ): Promise<FeatureUsageResult> {
    return (await this.module()).useFeatureAndWait(
      featureId,
      options?.amount,
      options?.entityId,
      options?.setUsage,
      options?.metadata,
    );
  }
}
