# Bare React Native Setup

Bare React Native apps use the same TypeScript API with native linkage managed
by the host project.

## Install

```bash
bun add @nuxie/react-native
```

## iOS

Ensure the Nuxie iOS SDK is available to the app target, then install pods:

```bash
cd ios
pod install
```

The wrapper pins the Nuxie pod version it was built against.

## Android

Ensure Gradle resolves `ai.nuxie:nuxie-android`. The wrapper pins the native
artifact version it was built against and requires minSdk 23.

## Configure

Bare apps normally pass the API key directly:

```ts
await Nuxie.configure({
  apiKey: "NX_PROD_...",
  environment: "production",
});
```

The Expo plugin fallback is unavailable unless the host also uses Expo config
plugins or writes equivalent `NUXIE_API_KEY` metadata itself.

## Native permission declarations

Declare every permission used by authored Experience actions. Common examples
include tracking, camera, microphone, photos, foreground location, and Android
13+ notifications. The wrapper does not add these declarations because their
purpose strings and platform policy belong to the host app.
