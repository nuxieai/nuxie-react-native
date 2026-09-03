import { StatusBar } from "expo-status-bar";
import React, { useState } from "react";
import { Button, Platform, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  NuxieProvider,
  useFeature,
  useNuxieClient,
  useNuxieEvents,
  type NuxieConfigureOptions,
  type NuxiePurchaseController,
} from "@nuxie/react-native";

const nuxieConfiguration: NuxieConfigureOptions = {
  environment: "development",
  logLevel: "debug",
  usePurchaseController: true,
};

const purchaseController: NuxiePurchaseController = {
  async onPurchase() {
    return { type: "cancelled" };
  },
  async onRestore() {
    return { type: "no_purchases" };
  },
};

function DemoScreen() {
  const client = useNuxieClient();
  const feature = useFeature("pro_export", { policy: "cacheFirst" });
  const [identity, setIdentity] = useState("(unknown)");
  const [logs, setLogs] = useState<string[]>([]);

  const appendLog = (message: string) => {
    setLogs((previous) => [
      `${new Date().toISOString()} ${message}`,
      ...previous,
    ].slice(0, 20));
  };

  useNuxieEvents({
    onActivity(activity) {
      appendLog(`activity ${activity.name}`);
    },
    onAppAction(action) {
      appendLog(`app action ${action.name}`);
    },
    onFeatureAccessChanged(event) {
      appendLog(`feature ${event.featureId}: allowed=${event.to.allowed}`);
    },
    onPurchaseRequest(request) {
      appendLog(`purchase ${request.request_id} for ${request.product_id}`);
    },
    onRestoreRequest(request) {
      appendLog(`restore ${request.request_id}`);
    },
  });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="auto" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Nuxie React Native SDK Example</Text>
        <Text>Platform: {Platform.OS}</Text>
        <Text>Configured: {String(client.isConfigured)}</Text>
        <Text>Feature loading: {String(feature.isLoading)}</Text>
        <Text>Feature allowed: {String(feature.value?.allowed ?? false)}</Text>
        <Text>Feature balance: {String(feature.value?.balance ?? "n/a")}</Text>
        <Text>Identity: {identity}</Text>

        <View style={styles.buttons}>
          <Button
            title="Identify User"
            onPress={() => {
              void (async () => {
                const distinctId = `example_${Date.now()}`;
                await client.identify(distinctId, {
                  userProperties: { plan: "free" },
                });
                setIdentity(await client.getDistinctId());
                appendLog(`identified ${distinctId}`);
              })().catch((error) => appendLog(`identify failed: ${String(error)}`));
            }}
          />
          <Button
            title="Capture Event"
            onPress={() => {
              client.trigger("paywall_opened", { source: "example_button" });
              appendLog("event captured");
            }}
          />
          <Button
            title="Refresh Feature"
            onPress={() => {
              void feature.refresh().then(() => appendLog("feature refreshed"));
            }}
          />
          <Button
            title="Dismiss Experience"
            onPress={() => {
              void client.dismiss().catch((error) => appendLog(`dismiss failed: ${String(error)}`));
            }}
          />
        </View>

        <Text style={styles.subtitle}>Recent native activity</Text>
        {logs.length === 0 ? <Text>(no activity yet)</Text> : null}
        {logs.map((line, index) => (
          <Text key={`${line}-${index}`} style={styles.logLine}>
            {line}
          </Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

export default function App() {
  const [configureError, setConfigureError] = useState<string | null>(null);

  return (
    <NuxieProvider
      config={nuxieConfiguration}
      purchaseController={purchaseController}
      onConfigureError={(error) => {
        setConfigureError(error instanceof Error ? error.message : String(error));
      }}
    >
      <DemoScreen />
      {configureError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>Configure error: {configureError}</Text>
        </View>
      ) : null}
    </NuxieProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  content: {
    padding: 16,
    gap: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 4,
  },
  subtitle: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: "600",
  },
  buttons: {
    marginTop: 8,
    gap: 10,
  },
  logLine: {
    fontSize: 12,
  },
  errorBanner: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#fee2e2",
    borderTopWidth: 1,
    borderTopColor: "#ef4444",
  },
  errorText: {
    color: "#991b1b",
    fontSize: 12,
  },
});
