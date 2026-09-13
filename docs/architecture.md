# Architecture

One standard React Native Codegen TurboModule serves bare React Native and Expo. Kotlin and a Swift/ObjC++ adapter call the native Nuxie SDKs. There is no Expo module dependency, parallel legacy bridge, JavaScript commerce engine, or custom Fabric view.

The private transport uses explicitly serialized JSON for recursive application properties and validates finite values, cycles, typed responses, and counter precision. Methods remain individually declared in Codegen. The public API exposes typed application concepts.

Configuration subscribes before native startup and negotiates the bridge contract, session, native version, and initial Feature snapshot. Session, identity, and revision checks reject stale updates. Native owns snapshot readiness and access. React uses `useSyncExternalStore` over immutable snapshots; selected Feature objects retain identity when unrelated Features change.

The process client owns configuration and the purchase controller. Providers own only subscriptions. Equivalent setup is idempotent; competing configurations and runtimes fail explicitly. Fast Refresh can reattach to compatible native state without clearing identity or persistent commands. Explicit shutdown tears down the SDK. Native invalidation releases callbacks and pending controller requests.

Queries are separate from observations. A scoped read never writes a global Feature snapshot. Native owns consumption journaling and stable operation-ID recovery; `accepted` remains distinct from post-consumption access.

## Distribution

`NATIVE-PINS.json` owns immutable native revisions. iOS uses React Native's CocoaPods `spm_dependency` helper to attach the canonical Swift Package and its runtime product to the wrapper target.

Android's owning Gradle variant generates an AAR and Maven POM from the pinned source. The npm package carries those artifacts. The wrapper consumes the AAR and reads its transitive dependencies from the POM; no private registry or source composite is required in a consumer app. Maintainers prepare artifacts before packing; consumers receive them in the tarball.

The Expo plugin is an optional no-op entry point. Autolinking provides the integration; runtime keys belong in JavaScript. Native contract changes require a new binary and compatible Expo OTA runtime policy.
