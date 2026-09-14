# Build and run the SDK

Use Node 24 LTS, pnpm 11, Bun, Xcode 26.4 or newer, Ruby 3.2 or newer with Bundler, and JDK 17 with an Android SDK/NDK. [Expo 57 requires Xcode 26.4+](https://docs.expo.dev/versions/latest/). The example locks record exact React Native, Expo, and CocoaPods dependencies.

After installing the SDK and both examples' JavaScript dependencies and preparing the native package, run `node scripts/check.mjs` for full qualification. It installs the frozen gems from `examples/bare/Gemfile.lock` into `.build/gems`, then builds both hosts for iOS and Android. Use a UTF-8 locale and set `ANDROID_HOME` to your Android SDK. CI selects the side-by-side Xcode 26.5 installation at `~/Applications/Xcode-26.5.app` through `DEVELOPER_DIR`.

## Prepare a package

From this SDK repository:

```sh
pnpm install --ignore-workspace
pnpm --ignore-workspace run prepare:native
pnpm --ignore-workspace run build
pnpm --ignore-workspace run typecheck
pnpm --ignore-workspace run typecheck:examples
pnpm --ignore-workspace run lint
pnpm --ignore-workspace run test
pnpm --ignore-workspace run check:package
npm pack
```

`prepare:native` fetches the exact Android revision from `NATIVE-PINS.json`, builds its release variant, and writes the native AAR, POM, and checksums under ignored `android/maven`. Native repository access is needed by maintainers preparing a package, not Android npm consumers. iOS resolves its exact Swift Package revision through CocoaPods/Xcode.

Keep the generated Maven artifact out of source control and inside the npm tarball. `check:package` checks its digest, ABI contents, exports, server-safe Node import, and tarball inclusion. Never change a pin without regenerating and qualifying the native artifact.

## Run either example

Both hosts load `examples/shared/lab.tsx`. They intentionally have independent package and native project configuration.

Bare React Native:

```sh
cd examples/bare
pnpm install --ignore-workspace
cd ios && pod install && cd ..
pnpm --ignore-workspace ios
# or: pnpm --ignore-workspace android
```

Expo:

```sh
cd examples/expo
pnpm install --ignore-workspace
pnpm --ignore-workspace exec expo prebuild --no-install
cd ios && pod install && cd ..
pnpm --ignore-workspace ios
# or: pnpm --ignore-workspace android
```

The repository examples use a local package dependency while iterating. For release qualification, install the generated tarball into each host, regenerate native projects/pods, and repeat the builds. A source-linked build alone does not prove a packed installation.

Enter development public keys in the Lab. Use a published trigger and Feature from the same app. A scoped consumption check needs a real grant explicitly assigned to that customer/entity. The operation-ID field stays explicit so you can retry the same spend and inspect `idempotentReplay`.

### Run the in-app backend checks

Connect with your development public keys, enter the Customer ID and a metered Feature ID, then supply two different entity IDs with positive grants for that customer. Tap **Run API checks · spend one unit**. The live activity log must finish with **API CHECKS PASSED**.

The check changes and clears the locale, resets and identifies the customer to synchronize the profile, verifies live readiness and cache-first entity resolution, rejects an unknown entity, spends one unit from Entity A, retries the same operation ID, verifies exactly one debit and Entity B isolation, resets to an anonymous identity, and identifies the original customer again. Each new run creates a new command ID and spends one unit. Use disposable development grants. An exhausted or unscoped grant is a real failure, not something the example mocks or bypasses.

The individual query and consumption controls remain useful for investigating failures and testing a chosen operation ID. The Experience section uses your authored trigger and exposes dismissal and restore; activity and App Actions are visible in the same log.

## Local backend

Normal app code selects `environment: 'development'`. Endpoint overrides are debug-host-only diagnostics. iOS debug builds read `NUXIE_RN_API_ENDPOINT` from the process environment; Android debuggable builds read the launch Intent extra with that name. Production builds ignore these overrides. Use the parent Nuxie checkout's `pnpm run dev:print` origin; Android emulators reach the host through `10.0.2.2`.

## What to exercise

Verify startup and failure, live/empty/unknown Feature state, identity rotation, scoped query isolation, committed-last-unit consumption, same-ID retry, trigger presentation, activity, App Actions, dismissal, restore and external-controller cancellation/failure. Repeat foreground/background, Activity recreation, Strict Mode and JavaScript reload without resetting native customer state.

Keep store-sandbox and EAS-cloud results separate from local debug-build evidence. Follow [validation](validation.md) for the current record.
