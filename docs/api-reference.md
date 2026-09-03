# API Reference

## Exports

```ts
import {
  Nuxie,
  NuxieClient,
  NuxieProvider,
  useNuxieClient,
  useFeature,
  useNuxieEvents,
} from "@nuxie/react-native";
```

The package also exports the public configuration, Feature, activity,
App Action, and purchase-controller types used below.

## `Nuxie` and `NuxieClient`

`Nuxie` is the shared client. Construct `NuxieClient` only when dependency
injection or an isolated test client is useful.

### Lifecycle

- `configure(options: NuxieConfigureOptions): Promise<void>`
- `shutdown(): Promise<void>`

Configuration fields:

- `apiKey?: string`
- `environment?: "production" | "development"`
- `logLevel?: "verbose" | "debug" | "info" | "warning" | "error" | "none"`
- `enableConsoleLogging?: boolean` (iOS)
- `redactSensitiveData?: boolean` (iOS)
- `localeIdentifier?: string | null`
- `purchaseHandlingMode?: "full" | "observer"`
- `testStoreEnabled?: boolean` (iOS development builds)
- `usePurchaseController?: boolean`

An explicit API key wins over the native `NUXIE_API_KEY` value installed by
the Expo plugin. Configuration throws `MISSING_API_KEY` if neither exists.

### Identity

- `identify(distinctId, options?): Promise<void>`
- `reset(options?: { keepAnonymousId?: boolean }): Promise<void>`
- `getDistinctId(): Promise<string>`
- `getAnonymousId(): Promise<string>`
- `isIdentified(): Promise<boolean>`

`identify` accepts `userProperties` and `userPropertiesSetOnce`. `reset`
creates a fresh anonymous identity by default; pass `keepAnonymousId: true`
only when the host deliberately wants to retain it.

### Events and presentation

- `trigger(eventName, properties?): void`
- `dismiss(): Promise<void>`
- `setLocaleIdentifier(localeIdentifier): Promise<void>`

`trigger` captures an event. It has no operation handle, result stream,
cancellation method, or Journey decision result. Native Journey execution
continues asynchronously. Experiences can only be presented by that execution.

Changing locale updates cached settings and takes effect at the next launch or
foreground profile synchronization.

### Features

- `hasFeature(featureId, options?): Promise<FeatureAccess>`
- `useFeature(featureId, options?): Promise<void>`
- `useFeatureAndWait(featureId, options?): Promise<FeatureUsageResult>`

`hasFeature` options:

- `requiredBalance?: number`
- `entityId?: string`
- `policy?: "cacheFirst" | "remote"`

`useFeature` options:

- `amount?: number`
- `entityId?: string`
- `metadata?: Record<string, unknown>`

`useFeatureAndWait` also accepts `setUsage?: boolean`. Its result preserves
`authoritativeAccess`, including fractional balances, when native commerce
returns an atomic post-use access snapshot.

### Events

Subscribe with `on(eventName, listener)` and call the returned function to
unsubscribe. Event names are:

- `featureAccessChanged`
- `activity`
- `appAction`
- `purchaseRequest`
- `restoreRequest`

```ts
type NuxieClientEventMap = {
  featureAccessChanged: {
    featureId: string;
    from: FeatureAccess | null;
    to: FeatureAccess;
    timestampMs: number;
  };
  activity: NuxieActivityInfo;
  appAction: AppAction;
  purchaseRequest: PurchaseRequest;
  restoreRequest: RestoreRequest;
};
```

`NuxieActivityInfo` is the flat, analytics-ready native activity contract. It
contains `schemaVersion`, stable event identity and timestamps, `name`, and
snake_case scalar `properties`. Experiment exposure is emitted only after an
authored variant becomes visible.

`AppAction` contains the authored action `name`, scalar `payload`, and its
`ExperienceRef` (`experienceId`, optional `experienceVersion`, optional
`journeyId`).

### Purchase controller

- `setPurchaseController(controller: NuxiePurchaseController | null): void`

Purchase and restore requests use snake_case fields. Purchase results are
`purchased`, `cancelled`, `pending`, or `failed`; restore results are
`restored`, `no_purchases`, or `failed`.

## React API

### `NuxieProvider`

Props:

- `config?: NuxieConfigureOptions`
- `purchaseController?: NuxiePurchaseController | null`
- `client?: NuxieClient`
- `onConfigureError?: (error: unknown) => void`

### `useNuxieClient()`

Returns the provider client, or the shared `Nuxie` client outside a provider.

### `useFeature(featureId, options?)`

Options are `requiredBalance`, `entityId`, and `policy`. The hook returns:

- `value: FeatureAccess | null`
- `isLoading: boolean`
- `error: Error | null`
- `refresh(): Promise<FeatureAccess>`

The initial check uses the selected policy; `refresh()` always performs a
remote check. Native Feature-change callbacks update the hook value.

### `useNuxieEvents(callbacks)`

Callbacks are `onFeatureAccessChanged`, `onActivity`, `onAppAction`,
`onPurchaseRequest`, and `onRestoreRequest`.
