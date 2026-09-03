# Troubleshooting

## `MISSING_API_KEY` during configuration

Pass `apiKey` to `configure()`, or install `NUXIE_API_KEY` through the Expo
plugin. The SDK cannot configure without one of those values.

## Expo plugin resolution fails

- Run `bun install`.
- Use the plugin entry `@nuxie/react-native/plugin`.
- Use prebuild or a development client. Expo Go cannot load this native module.

## Native module is unavailable

If the error says `Nuxie native bridge (NuxieExpo) is unavailable`, regenerate
and rebuild the native app after installing the package. For bare React Native,
verify CocoaPods and Gradle linkage.

## An event produced no visible Experience

`trigger()` is fire-and-forget and does not return a Journey match or
presentation result. Inspect forwarded `activity` events and the native logs
to distinguish normal no-match behavior from an Experience load or
presentation failure.

## Purchase request times out

- Set the purchase controller before `configure()`, or pass it to the provider.
- Return `purchased`, `cancelled`, `pending`, or `failed` for every purchase.
- Return `restored`, `no_purchases`, or `failed` for every restore.
- Read request fields by their snake_case names.

## Verify the example

```bash
cd example
bun install
bun run verify
```
