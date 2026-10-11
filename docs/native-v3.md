# Native journey-release v3 consumers

The source preview pins iOS `28587b9b8e0c1fbcb012ebdff9645626706adcb8`
and Android `2e4c39929b397c808da0b9eefe4741aa83f8a4d0`.
The native release reader and signing domain are v3. The React Native bridge
contract remains 1; the outer native profile remains
`nuxie.journey-plane-profile.v2`.

Run the owning readiness command from this checkout:

```sh
node scripts/check.mjs
```

First follow [development setup](development.md): prepare the pinned native
Maven product, build the JavaScript package, and reinstall both examples' frozen
file dependencies. Existing `NUXIE_IOS_DEBUG_ARTIFACTS`,
`NUXIE_IOS_RELEASE_ARTIFACTS` and `NUXIE_ANDROID_ARTIFACTS` overrides may reuse
authentic matching native receipts. Preparation validates source revisions and
checksums; never relabel another revision's products. Bazel caches remain shared
across worktrees while product staging and output bases belong to this checkout.
The Xcode SwiftPM resolver must regenerate the bare example's tracked lock when
the native pin changes.

The public native configure, identify and trigger signatures remain compatible.
Both bridges already forward activity names/properties generically, including
the newly added `linkOpened` activity. Native Journey schema and signing versions
do not change the wrapper bridge contract.

The development examples also expose an isolated real-consumer probe. Generate
its four signed profiles from a clean native iOS checkout at the exact pin:

```sh
node scripts/v3-probe-fixtures.mjs \
  --native-ios-checkout /absolute/pinned-nuxie-ios \
  --output /absolute/new-signed-fixture-directory
python3 -m unittest discover -s scripts/bazel -p test_v3_probe.py
```

The generator reads the committed native `fixtures/journeys/planes/release.json`
and its public test-only signing key, records both native revisions and all byte
hashes, and verifies Ed25519 signatures. Retired v1/v2 descriptors retain valid
v3-domain signatures; the wrong-domain vector signs the valid v3 bytes with the
retired v2 domain. Keep the generated capsule and manifest with the run evidence.
Serve one selected case:

```sh
python3 scripts/v3-probe.py serve --fixtures /absolute/signed-fixture \
  --case accepted --consumer react-native --platform ios \
  --output /absolute/unique-evidence-directory
```

The server sends the app/environment authority and a quoted profile-SHA ETag;
both native canonical profile consumers require an authenticated cache validator.
Its transport ledger uses the native `distinct_id` and `idempotency_key` wire
fields, while curated activities retain their public `experience_version` alias.

Set `examples/shared/local-defaults.json` to
`{"v3ProbeUrl":"http://127.0.0.1:<printed-port>"}` and start the bare or Expo
development host through its normal Metro entrypoint. Launch the iOS Debug host
with `NUXIE_RN_API_ENDPOINT` set to that same endpoint. Android Debug hosts
use the `NUXIE_RN_API_ENDPOINT` Activity intent extra and
`http://10.0.2.2:<port>` to reach the host fixture server.

The probe calls the public JavaScript client, subscribes before configuration,
identifies the fresh fixture customer and triggers the authored event. It records
native activity, version and Feature state plus a barrier of 45 distinct native
event deliveries. It reports observations rather than assigning a verdict.

Use a newly created, task-owned simulator or an explicitly leased device. Retain
the device UDID, Git commit, package/lock hashes, native receipts, actual built
app hash, launch command and returned process ID. For each case, stop the prior
app, restart the server with a new evidence directory and fresh API key/customer,
then launch a fresh app process. Do not reset another worktree's simulator.

On iOS, capture the case's start/end times and the returned process ID, then
retain only that process's unified log in that time interval:

```sh
xcrun simctl spawn "$DEVICE_UDID" log show --style json --info --debug \
  --start "$CASE_STARTED_AT" --end "$CASE_ENDED_AT" \
  --predicate "processIdentifier == $APP_PID" > /absolute/scoped-native.log
```

If the simulator does not retain Debug messages, start `log stream --level debug`
for the owning app process before the case and retain its PID/time-bounded output.
The identified-profile rejection can occur at a Debug log site; a missing category
is a failed evidence run, not permission to infer rejection from a timeout.

On Android, retain `adb logcat --pid="$APP_PID"` from the freshly launched app
through the observation barrier. Record the emulator/device identity separately.
Check the source-bound log for the vector's actual native verifier rejection,
then run the independent verifier:

```sh
python3 scripts/v3-probe.py verify --fixtures /absolute/signed-fixture \
  --ledger /absolute/unique-evidence-directory/server-ledger.json \
  --native-log /absolute/scoped-native.log --output /absolute/verdict.json
```

Repeat in fresh native sessions for `retired-v1`, `retired-v2` and
`wrong-domain`. A negative verdict requires a scoped terminal native profile
rejection with the concrete authentication error category, completed
profile/event transport and no admitted Journey. Default native privacy redacts
error descriptions: iOS retains `JourneyReleaseAuthenticationError` at its
profile-failure log sites; Android retains
`ai.nuxie.sdk.experiences.JourneyReleaseAuthenticationException` at the
`Journey plane profile rejected` site. The receipt separates this observed
category-only proof from the independently signed fixture's expected contract
code. It never accepts a generic network failure or a bare expected-code string.
The positive verdict checks ordered Journey identity/outcome and exact
typed native completion outputs. A screenless fixture establishes neither
rendered screens nor form editing, purchases or physical-device behavior.
