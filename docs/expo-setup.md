# Expo Setup

This SDK requires Expo prebuild or a development client. Expo Go cannot load
the native Nuxie module.

## Install and add the plugin

```bash
bun add @nuxie/react-native
```

```json
{
  "expo": {
    "plugins": [
      ["@nuxie/react-native/plugin", { "apiKey": "NX_PROD_..." }]
    ]
  }
}
```

The plugin writes `NUXIE_API_KEY` to the iOS app plist and Android app manifest.
You may still pass an explicit key; it takes precedence.

```ts
await Nuxie.configure({
  environment: "production",
  logLevel: "warning",
});
```

## Native permission actions

Add app-owned permission descriptions and declarations for any permission an
authored Experience may request. For example, configure the appropriate iOS
usage-description strings and Android permissions for tracking, notifications,
camera, microphone, photos, or location. The Nuxie plugin manages only the API
key.

## Build and run

```bash
bunx expo prebuild
bunx expo run:ios
bunx expo run:android
```

Or start an existing development client:

```bash
bunx expo start --dev-client
```

Run `bun run verify` from the package's `example` directory to check the SDK
build, example typecheck, Expo config, and both native prebuilds.
