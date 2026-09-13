# API reference

Import the client, hooks, and public types from `@nuxie/react-native`. [Type definitions](../src/types.ts) are the exact contract.

## Client

| Method | Result / behavior |
| --- | --- |
| `configure(configuration)` | `Promise<void>`; identical concurrent setup shares work. |
| `getStatus()` / `subscribeStatus(listener)` | Cached immutable lifecycle state / unsubscribe function. |
| `getFeatures()` / `subscribeFeatures(listener)` | Coherent global snapshot / unsubscribe function. |
| `identify(customerId, { properties?, propertiesSetOnce? })` | Changes identity through native. |
| `reset({ keepAnonymousId? })` | Rotates anonymous identity unless explicitly retained. |
| `getDistinctId()` / `getAnonymousId()` / `getIsIdentified()` | Async identity reads. |
| `setLocaleIdentifier(localeOrNull)` | Sets the locale for the next launch/foreground profile sync; null restores device behavior. Current profile authority is withdrawn until synchronization. |
| `trigger(event, properties?)` | Acknowledges native invocation. |
| `dismiss()` | Dismisses the presented Experience. |
| `hasFeature(featureId, { requiredBalance?, entityId?, policy? })` | `Promise<FeatureAccess>`; cacheFirst is default. |
| `consumeFeature(featureId, { quantity, operationId, entityId? })` | `Promise<FeatureConsumption>`; check `accepted`. |
| `restorePurchases()` | `Promise<RestoreResult>`. |
| `onActivity(listener)` / `onAppAction(listener)` / `onError(listener)` | Live subscriptions returning unsubscribe functions. |
| `shutdown()` | Explicit native teardown and JS state cleanup. |

## React

- `NuxieProvider`: optional `client`, optional `configuration`, and `onActivity`, `onAppAction`, `onError` callbacks. Children render during initialization.
- `useNuxie()`: provider client, or the process singleton.
- `useNuxieStatus()`: immutable lifecycle status.
- `useFeatures()`: global immutable snapshot.
- `useFeature(id)`: stable `{ state, access }` selection; never fetches or spends.
- `useNuxieActivity(handler)` / `useNuxieAppAction(handler)`: live subscription with the latest callback and automatic unsubscribe.

## State and errors

`FeatureSnapshot` combines `state`, `all`, `identityGeneration`, and `revision`. Native counters are decimal strings to avoid losing precision above JavaScript's safe-integer limit.

`NuxieError` extends `Error` with a stable `code`. Native errors retain their cause. Invalid arguments reject before native invocation. Results arriving after session/customer transitions reject as stale rather than being applied to the new customer.

Native bridge DTOs, purchase request IDs, completion functions, module injection, and constructor factories are private implementation details.
