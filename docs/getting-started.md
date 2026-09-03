# Getting Started

## 1. Install

```bash
bun add @nuxie/react-native
```

## 2. Configure

```ts
import { Nuxie } from "@nuxie/react-native";

await Nuxie.configure({
  apiKey: "NX_PROD_...",
  environment: "production",
});
```

## 3. Identify

```ts
await Nuxie.identify("user_123", {
  userProperties: { plan: "pro", locale: "en_US" },
});
```

## 4. Capture an event

```ts
Nuxie.trigger("paywall_opened", { source: "settings" });
```

The event enters native delivery and ordered Journey evaluation. Any matching
Journey runs asynchronously; `trigger` does not return a result.

## 5. Observe native activity and App Actions

```ts
const stopActivity = Nuxie.on("activity", (activity) => {
  analytics.track(activity.name, activity.properties);
});

const stopActions = Nuxie.on("appAction", (action) => {
  if (action.name === "open_settings") {
    navigation.openSettings(action.payload);
  }
});

// Later:
stopActivity();
stopActions();
```

## 6. Check and use Features

```ts
const access = await Nuxie.hasFeature("ai_credits", {
  requiredBalance: 2.5,
  entityId: "project_123",
  policy: "remote",
});

if (access.allowed) {
  const usage = await Nuxie.useFeatureAndWait("ai_credits", {
    amount: 2.5,
    entityId: "project_123",
  });
  console.log(usage.authoritativeAccess);
}
```

## 7. Optional React provider and hook

```tsx
import { NuxieProvider, useFeature } from "@nuxie/react-native";

function Root() {
  return (
    <NuxieProvider config={{ apiKey: "NX_PROD_..." }}>
      <Screen />
    </NuxieProvider>
  );
}

function Screen() {
  const feature = useFeature("pro_export", { policy: "cacheFirst" });
  return null;
}
```

Continue with [Expo Setup](./expo-setup.md), [Bare React Native Setup](./bare-react-native-setup.md), or the [API Reference](./api-reference.md).
