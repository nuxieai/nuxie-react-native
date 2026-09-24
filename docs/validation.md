# SDK qualification

## Experience goal and eligibility pins

iOS `45af488ea507429c0da2c7659ca971ee45460efb` and Android
`af804278a226282e8e3abdea7c48385901b79638` implement the Experience policy
hard cut: one optional goal, retained conversion measurement, presentation-safe
exits, and offer-specific access checks. Milestone and old policy payloads are
rejected. The iOS pin additionally bounds retained subscriber-delivery retries
while preserving original eligibility and capture order.

Both native SDK gates passed. `python3 scripts/prepare-native.py` and
`node scripts/check.mjs` passed: lint, types, 19 JavaScript tests, package build,
and bare/Expo iOS and Android host builds. Both iOS logs resolved `45af488e`.
The initial run built stale installed example file dependencies; the host gate
now rejects mismatched installed pins. After refreshing each example with
`pnpm --ignore-workspace install --force`, the first build encountered a stale
Xcode compiled-header cache. Cleaning both example builds and rerunning the
complete check passed.
Rendered goal/eligibility acceptance remains part of the coordinated platform
cutover.

## Previous video SDK pin qualification

iOS `1e6970f306a9dac2ed567a239bf0e64a83e2d7cc` and Android
`20f9d42f7d5fe1cba6e2426d63c24499eb966ce7` add obsolete profile-acquisition
cancellation and active system-caption preference refresh. Both accept
distinct video bindings that share immutable media. These native changes have
focused native regressions and device qualification. The PR records wrapper
preparation, resolution, and committed-tree readiness at these exact pins.

The prior wrapper playback and signed-download evidence below remains tied to
its recorded revisions; this pin refresh does not repeat the full device matrix.
Native media-clock timing qualification is separate from wrapper playback and
does not measure external speaker latency.

## Previous native pin qualification

iOS `48fa51d6591f61d437620abfa06eb7fcb1a64564` and Android
`4d65783e2eec5b585673041146dff887258d3c93` include published Apple runtime
0.10.8 and Android runtime 0.4.8, rendered-video visibility, interruption
recovery, and preservation of leased iOS video files when signed metadata
conflicts with verified size. The bare SwiftPM lock resolves the iOS pin.
The PR records final committed-tree readiness.

With preceding iOS `95d76d41` and Android `4d65783e`, the canonical check
passed lint, SDK/example typechecks, 19 JavaScript tests, package build, exports,
server import, plugin, native digest, 16 KiB alignment, and 77-file inventory.
Bare React Native and Expo each passed arm64 iOS simulator and Android Debug
builds. Both installed Android AARs were independently matched to the prepared
artifact. Both hosts then visibly played the signed video on the iOS 26.5
simulator and approved API 36 Android emulator; 12 screenshots per host captured
red and blue phases, and independent cached scene/MP4 hashes matched the signed
inventory. One bare Android capture failed on an empty adb screenshot; its
bounded transport retry passed without restarting the app.

The later iOS cache-only guard has an independent native regression. The bare
host built against that final pin and passed the actual acquisition failures
and recovery below. These checks do not establish physical Android performance,
measured audio synchronization, or the entire lifecycle/resource matrix.
Evidence lives in the parent worktree's `.nuxie/task3b-rn-final-*` and
`.nuxie/task3b-ios-{corrupt,interrupted}*` logs, samples, and cache hashes.

## Signed iOS download failures and recovery — September 18, 2026

The actual bare app used final iOS `48fa51d6`, a separate fixture origin, and the
same signed release. The fixture copy changed only unsigned delivery base URLs.
A normal baseline rendered red/blue video and warmed the profile and scene.
Before each fault, the app was terminated and only files whose bytes matched the
synthetic MP4's known SHA-256 were removed, including its object-cache, lease,
and URL-cache copies. The signed profile and verified scene remained intact.

The existing parent fixture server ran with `--mode corrupt`, then separately
with `--mode interrupted --after-bytes 1024`. Each case received two MP4 requests
(cached-profile admission and the fresh profile). Corruption returned the full
22,065 bytes with incorrect content; interruption wrote only 1,024 bytes before
closing. The SDK reported `JourneyReleaseResourceFailure`, promoted no video
object, left no partial files in app temporary storage, and retained the exact
verified scene.

For each recovery, the harness only terminated the app, restarted the same
fixture endpoint in normal mode, and relaunched the app. It did **not** remove
or repair any cache after the fault. Each recovery fetched the MP4 once,
restored its exact signed digest, and produced 12 screenshots containing both
video phases. Server ledgers, cleanup snapshots, SDK system logs, and pixel
samples record each step. These are simulator end-to-end tests, not mocked
transport tests.

This file records actual evidence. A build proves compilation and linkage; it does not prove store checkout or backend commerce.

## Native video fix refresh — September 18, 2026

The preceding qualification used iOS `858321e2` and Android `1514b1c`, both pushed development
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
