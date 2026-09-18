# SDK qualification

This file records actual evidence. A build proves compilation and linkage; it does not prove store checkout or backend commerce.

## Native video fix refresh — September 18, 2026

Current pins are iOS `858321e2` and Android `1514b1c`, both pushed development
commits. They include production shared decoder pools, hidden-screen
retirement/suspension, and the iOS content-addressed-video format fix. The
Android revision is unchanged from the previous native preparation.
`node scripts/check-package.mjs` passed after this iOS refresh, including the exact
Android artifact digest, 16 KiB alignment, and 77-file package inventory.
The iOS bare-example SwiftPM lock now names the new revision. The bare host passed its arm64 iOS simulator Debug build and Android
`:app:assembleDebug`. The first Android attempt found an older Maven artifact
in the installed file dependency; reinstalling the local package with
`pnpm --ignore-workspace install --force --offline` restored the current pinned
artifact, and the build passed. Expo prebuild, pod installation, and the arm64 iOS simulator Debug build also
passed with iOS `858321e2`. Expo Android `:app:assembleDebug` passed as well (360 tasks). Both hosts then visibly played the signed video on iOS and Android, with 12
screenshot samples per host showing both red and blue phases. Independent
hashes of all four apps' cached scene and video bytes matched the signed
inventory. Expo also restarted and played from cache with the fixture origin
suspended, while Metro remained available. Its Android host waited through two
30-second profile timeouts before presenting. The first restart command opened
the Expo launcher; the corrected deep-link launch reached the SDK and passed.
This is origin-outage coverage, not fully offline JavaScript startup.

The Lab supports ignored local defaults in development Metro bundles. SDK and
example typechecks, lint, and all 19 wrapper tests passed. An actual release-mode
bare-host bundle excluded the local fixture keys. Final readiness/review and the
broader failure, audio, caption, and resource matrix remain outstanding.

## Earlier video delivery candidate — September 18, 2026

The earlier video candidate pinned iOS `38428e8bb1c65605d6c982ff22b2a18d63229950`
and Android `e76714a76e14b8f293e782934c107a789d0a67f0`. These are pushed
development commits, pending native SDK review and final qualification under
[UNIV-3262](https://universe.basis.dev/issue/UNIV-3262).

The Android preparation script builds this exact SDK revision into the packaged
Maven artifact. Release-variant registration belongs to the native SDK; the
wrapper adds its pinned publication without registering the variant again.

At these pins, `prepare:native`, `lint`, `typecheck`, `typecheck:examples`, `test`
(19 passing tests), `build`, and `check:package` passed. Package verification
checked the native digest, both 64-bit ABIs, ELF 16 KiB alignment, and the npm
file inventory. Bare React Native passed `:app:assembleDebug` and the arm64
iOS simulator Debug build on Xcode 27. Its SwiftPM resolution records the exact
iOS revision above. Expo 57.0.22 / React Native 0.86.3 passed prebuild,
`:app:assembleDebug`, and the arm64 iOS simulator Debug build on Xcode 27.
Both Android debug APKs passed `zipalign -c -P 16 -v 4`.
These checks do not establish video playback through a React Native or Expo
host. Signed-video device qualification remains outstanding at these pins.

## September 13 development matrix

| Host | iOS simulator debug build | Android debug / release APK |
| --- | --- | --- |
| Bare React Native 0.87.1 / React 19.2.3 | Passed | Passed / Passed |
| Expo 57.0.22 / React Native 0.86.3 / React 19.2.3 | Passed | Passed / Passed |

The iOS builds use the canonical pinned Swift Package with its runtime XCFramework. No global dynamic-frameworks setting or SwiftPM-helper patch was needed on Xcode 26.5. Android builds consume the prepared native AAR and POM, including its two 64-bit runtime ABIs.

The JavaScript regression suite covers shared/reentrant configuration, failed setup retry, native startup subscription ordering, full-precision revisions, stale identity reads, stable immutable Feature selections, last-unit receipt semantics, invalid properties/quantities, observer exceptions, and exactly-once external restore. React tests cover Strict Mode/unmount ownership and current callback delivery.

Package checks verify exported API, safe import without a native runtime, optional plugin behavior, Android artifact digest/ABIs, and tarball contents. The shared Lab typechecks against the public interface.

## Live backend evidence — September 13, 2026

Both hosts were installed from an npm tarball containing the pinned native dependencies. Both ran on an iPhone 17 Pro simulator (iOS 26.5) and an API 36 arm64 Android emulator against the local patched backend.

All four combinations passed the shared Lab checks with iOS `f48fa7e4` and Android `784540ac`: locale override/device fallback followed by an explicit identity transition, live Feature readiness, cache-first entity scope, denied unknown entity, committed consumption, idempotent same-ID replay, exactly one balance decrement, unchanged second entity, anonymous reset, and restored readiness after reidentify. Expo receipts include `rn-ios-1789317265448` and `rn-android-1789317287026`. These are backend receipts from actual native calls, not mocked bridge responses.

Both Android release APKs passed `zipalign -c -P 16 -v 4` for 16 KiB ZIP page alignment. ELF program-header inspection also passed: all load segments in the 26 bare-host and 34 Expo-host 64-bit shared libraries had alignment of at least 16 KiB.

An Expo iOS JavaScript reload reattached successfully: Feature state remained ready, the identified customer and anonymous ID were preserved, and no validator or identity reset ran during reattachment.

The bare React Native host also produced an unsigned iOS device archive with Release configuration, confirming device linkage and bundled JavaScript.

The authored Experience rendered in both Expo and bare React Native on iOS and Android, with native `journey_started`, `screen_shown`, and `experience_shown` activity delivered to JavaScript. Android bare-host `dismiss()` before Continue resolved and delivered `journey_completed` and `experience_dismissed`. The real compiler produced the content-addressed Rive artifact; no native presentation or backend response was mocked.

The local authoring setup required one project per platform. Republishing a project against another platform exposed [UNIV-3144](https://universe.basis.dev/issue/UNIV-3144), tracked separately from the SDK.

A clean Expo prebuild and the source-checkout native readiness gate passed for both hosts on both platforms. The final iOS pin includes `0524e1bc`, which fixes acknowledgement of host dismissal after a Journey has retired; its native lifecycle regression and native SDK readiness gate passed. See [UNIV-3145](https://universe.basis.dev/issue/UNIV-3145).

## Remaining qualification

The attended React Native App Action button interaction and subsequent dismissal have not been completed: the simulator UI automation service stopped accepting window actions. The JavaScript regression suite separately verifies authored App Action payload/context delivery, session fencing, and unsubscribe behavior; that is not a substitute for a live tap. Android dismissal after completion took about 107 seconds in the separate Flutter/native qualification and remains a performance concern.

Store-sandbox purchase/restore flows, physical-device testing, EAS cloud builds, and npm publication have not been performed by this qualification run.
