import { describe, expect, test } from "bun:test";
import { NuxieClient } from "../client";
import { TestNativeModule } from "./test-native-module";

async function waitFor(predicate: () => boolean, timeoutMs = 250): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("waitFor timeout");
}

describe("NuxieClient", () => {
  test("configure forwards only customer-owned native options", async () => {
    const module = new TestNativeModule();
    const client = new NuxieClient(async () => module);

    await client.configure({
      apiKey: "NX_TEST",
      environment: "development",
      logLevel: "debug",
      localeIdentifier: "en-GB",
      purchaseHandlingMode: "observer",
      usePurchaseController: true,
    });

    expect(module.configureArgs).toEqual({
      apiKey: "NX_TEST",
      options: {
        environment: "development",
        logLevel: "debug",
        localeIdentifier: "en-GB",
        purchaseHandlingMode: "observer",
      },
      usePurchaseController: true,
      wrapperVersion: "0.1.0",
    });
    expect(client.isConfigured).toBe(true);
  });

  test("configure uses the plugin key and rejects an absent key", async () => {
    const module = new TestNativeModule();
    module.defaultApiKey = "NX_FROM_PLUGIN";
    const client = new NuxieClient(async () => module);
    await client.configure({});
    expect(module.configureArgs?.apiKey).toBe("NX_FROM_PLUGIN");

    const missing = new NuxieClient(async () => new TestNativeModule());
    await expect(missing.configure({})).rejects.toMatchObject({ code: "MISSING_API_KEY" });
  });

  test("trigger is an event-only fire-and-forget call", async () => {
    const module = new TestNativeModule();
    const client = new NuxieClient(async () => module);
    await client.configure({ apiKey: "NX_TEST" });

    expect(client.trigger("premium_tapped", { source: "settings", count: 2 })).toBeUndefined();
    expect(module.triggers).toEqual([
      { eventName: "premium_tapped", properties: { source: "settings", count: 2 } },
    ]);
  });

  test("reset follows the native breaking default and surface controls forward", async () => {
    const module = new TestNativeModule();
    const client = new NuxieClient(async () => module);

    await client.reset();
    await client.reset({ keepAnonymousId: true });
    await client.dismiss();
    await client.setLocaleIdentifier(null);

    expect(module.resetValues).toEqual([false, true]);
    expect(module.dismissed).toBe(1);
    expect(module.localeIdentifiers).toEqual([null]);
  });

  test("policy-aware Feature access preserves fractional balances", async () => {
    const module = new TestNativeModule();
    const client = new NuxieClient(async () => module);

    const access = await client.hasFeature("credits", {
      requiredBalance: 2.5,
      entityId: "workspace-1",
      policy: "remote",
    });
    expect(access.balance).toBe(3.5);
    expect(module.featureChecks).toEqual([
      {
        featureId: "credits",
        requiredBalance: 2.5,
        entityId: "workspace-1",
        policy: "remote",
      },
    ]);

    const usage = await client.useFeatureAndWait("credits", { amount: 1.5 });
    expect(usage.authoritativeAccess?.balance).toBe(8);
  });

  test("forwards typed activities, App Actions, and Feature changes", async () => {
    const module = new TestNativeModule();
    const client = new NuxieClient(async () => module);
    const names: string[] = [];
    const actions: string[] = [];
    const features: string[] = [];

    client.on("activity", (event) => names.push(event.name));
    client.on("appAction", (action) => actions.push(action.name));
    client.on("featureAccessChanged", (event) => features.push(event.featureId));
    await waitFor(() => module.listeners.onActivity.size === 1 && module.listeners.onAppAction.size === 1);

    module.emit("onActivity", {
      schemaVersion: 1,
      id: "event-1",
      timestampMs: 1,
      receivedAtMs: 2,
      name: "journey_started",
      properties: { journey_id: "journey-1", leg_generation: 1 },
    });
    module.emit("onAppAction", {
      name: "open_settings",
      payload: { tab: "billing" },
      experience: {
        experienceId: "experience-1",
        experienceVersion: "version-1",
        journeyId: "journey-1",
      },
    });
    module.emit("onFeatureAccessChanged", {
      featureId: "pro",
      from: null,
      to: { allowed: true, unlimited: false, balance: 3.5, type: "metered" },
      timestampMs: 3,
    });

    expect(names).toEqual(["journey_started"]);
    expect(actions).toEqual(["open_settings"]);
    expect(features).toEqual(["pro"]);
  });

  test("purchase controller completes canonical snake-case requests", async () => {
    const module = new TestNativeModule();
    const client = new NuxieClient(async () => module);
    client.setPurchaseController({
      async onPurchase(request) {
        expect(request.product_id).toBe("product-1");
        return { type: "purchased" };
      },
      async onRestore() {
        return { type: "restored" };
      },
    });
    await client.configure({ apiKey: "NX_TEST" });

    module.emit("onPurchaseRequest", {
      request_id: "purchase-1",
      platform: "android",
      product_id: "product-1",
      store_product_id: "play-product-1",
      base_plan_id: null,
      purchase_option_id: "buy",
      offer_id: null,
      placement_id: "placement-1",
      display_name: null,
      display_price: null,
      timestamp_ms: 4,
    });
    module.emit("onRestoreRequest", {
      request_id: "restore-1",
      platform: "android",
      timestamp_ms: 5,
    });

    await waitFor(() => module.completedPurchases.length === 1 && module.completedRestores.length === 1);
    expect(module.completedPurchases).toEqual([
      { requestId: "purchase-1", result: { type: "purchased" } },
    ]);
    expect(module.completedRestores).toEqual([
      { requestId: "restore-1", result: { type: "restored" } },
    ]);
  });
});
