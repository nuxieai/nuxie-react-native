# SDK qualification

This file records actual evidence. A build proves compilation and linkage; it does not prove store checkout or backend commerce.

## Current development matrix

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

The authored Experience rendered in Expo on iOS and Android and in bare React Native on Android, with native `journey_started`, `screen_shown`, and `experience_shown` activity delivered to JavaScript. Android bare-host `dismiss()` before Continue resolved and delivered `journey_completed` and `experience_dismissed`. The real compiler produced the content-addressed Rive artifact; no native presentation or backend response was mocked.

The local authoring setup required one project per platform. Republishing a project against another platform exposed [UNIV-3144](https://universe.basis.dev/issue/UNIV-3144), tracked separately from the SDK.

## Qualification in progress

- Complete clean Expo prebuild and the final source-checkout readiness gate.
- Complete App Action and post-completion dismissal checks.

Store-sandbox purchase/restore flows, physical-device testing, EAS cloud builds, and npm publication have not been performed by this qualification run.
