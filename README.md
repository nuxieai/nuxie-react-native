# @nuxie/react-native

React Native bindings for the Nuxie iOS and Android SDKs. Journey execution,
Experience presentation, Features, identity, and commerce stay native; this
package supplies an Expo module plus a small TypeScript and React API.

## Platform support

| Runtime | Status |
| --- | --- |
| Expo development client / prebuild | Supported and recommended |
| Bare React Native | Supported with native linkage |
| Expo Go | Unsupported because the native module is required |

## Install

```bash
bun add @nuxie/react-native
```

The package requires React 18+, React Native 0.72+, and Expo 50+.

## Configure and capture events

```ts
import { Nuxie } from "@nuxie/react-native";

await Nuxie.configure({
  apiKey: "NX_PROD_...",
  environment: "production",
});

await Nuxie.identify("user_123", {
  userProperties: { plan: "pro" },
});

Nuxie.trigger("paywall_opened", { source: "settings" });
```

`trigger` is an event-only, fire-and-forget call. Matching Journeys run in
native code and present Experiences when their authored program reaches a
presentation step. Use `dismiss()` to close the active Experience.

## Features

```ts
const access = await Nuxie.hasFeature("pro_export", {
  requiredBalance: 1,
  policy: "cacheFirst",
});

if (access.allowed) {
  const result = await Nuxie.useFeatureAndWait("pro_export");
  console.log(result.authoritativeAccess);
}
```

Feature balances and usage amounts preserve fractional values. Set
`policy: "remote"` when the operation requires a fresh authoritative check.

## React API

```tsx
import { NuxieProvider, useFeature, useNuxieEvents } from "@nuxie/react-native";

export function App() {
  return (
    <NuxieProvider config={{ apiKey: "NX_PROD_..." }}>
      <Screen />
    </NuxieProvider>
  );
}

function Screen() {
  const feature = useFeature("pro_export");

  useNuxieEvents({
    onActivity(activity) {
      console.log(activity.name, activity.properties);
    },
    onAppAction(action) {
      console.log(action.name, action.payload);
    },
  });

  return null;
}
```

## Expo plugin

The optional config plugin stores a fallback API key in native app metadata:

```json
{
  "expo": {
    "plugins": [
      ["@nuxie/react-native/plugin", { "apiKey": "NX_PROD_..." }]
    ]
  }
}
```

`configure()` resolves an explicit `apiKey` first, then the plugin value, and
throws `MISSING_API_KEY` when neither exists.

## Purchase controller

Apps using a provider or custom billing stack can implement the portable
controller. Requests use the canonical snake_case contract and results declare
only the checkout outcome:

```ts
import type { NuxiePurchaseController } from "@nuxie/react-native";

const purchaseController: NuxiePurchaseController = {
  async onPurchase(request) {
    const result = await billing.purchase(request.store_product_id);
    if (result.cancelled) return { type: "cancelled" };
    return result.completed
      ? { type: "purchased" }
      : { type: "failed", message: result.message };
  },
  async onRestore() {
    return (await billing.restore())
      ? { type: "restored" }
      : { type: "no_purchases" };
  },
};
```

Set the controller before configuration or pass it to `NuxieProvider`. Native
requests time out after 60 seconds.

## Documentation

- [Getting Started](./docs/getting-started.md)
- [Expo Setup](./docs/expo-setup.md)
- [Bare React Native Setup](./docs/bare-react-native-setup.md)
- [API Reference](./docs/api-reference.md)
- [Purchase Controller Guide](./docs/purchase-controller.md)
- [Troubleshooting](./docs/troubleshooting.md)

## Development

```bash
bun run typecheck
bun test
bun run build
```

The full Expo example in [`example/`](./example) also verifies iOS and Android
prebuild generation with `bun run verify`.

## License

MIT
