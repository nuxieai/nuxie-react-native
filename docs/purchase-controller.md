# Purchase Controller Guide

Use a purchase controller when the host app or a billing provider owns
checkout. Nuxie still chooses the exact product shown by the Experience and
waits for the host's outcome declaration.

## Interface

```ts
type NuxiePurchaseController = {
  onPurchase(request: PurchaseRequest): Promise<PurchaseResult>;
  onRestore(request: RestoreRequest): Promise<RestoreResult>;
};
```

Requests use canonical snake_case fields. In particular, read
`request.request_id`, `request.product_id`, `request.store_product_id`, and the
optional Play plan and offer identifiers.

Purchase results:

- `{ type: "purchased" }`
- `{ type: "cancelled" }`
- `{ type: "pending" }`
- `{ type: "failed", message: string }`

Restore results:

- `{ type: "restored" }`
- `{ type: "no_purchases" }`
- `{ type: "failed", message: string }`

## Wiring

```ts
Nuxie.setPurchaseController(controller);
await Nuxie.configure({
  apiKey: "NX_PROD_...",
  usePurchaseController: true,
  purchaseHandlingMode: "observer",
});
```

Or pass the controller to `NuxieProvider`:

```tsx
<NuxieProvider
  config={{ apiKey: "NX_PROD_...", usePurchaseController: true }}
  purchaseController={controller}
>
  <App />
</NuxieProvider>
```

## Example

```ts
const controller: NuxiePurchaseController = {
  async onPurchase(request) {
    try {
      const result = await myBilling.purchase(request.store_product_id);
      if (result.status === "cancelled") return { type: "cancelled" };
      if (result.status === "pending") return { type: "pending" };
      return result.status === "purchased"
        ? { type: "purchased" }
        : { type: "failed", message: result.message ?? "purchase_failed" };
    } catch (error) {
      return {
        type: "failed",
        message: error instanceof Error ? error.message : "purchase_failed",
      };
    }
  },

  async onRestore() {
    const restored = await myBilling.restore();
    return restored ? { type: "restored" } : { type: "no_purchases" };
  },
};
```

Native requests fail after 60 seconds if the controller does not return.
Always settle each request exactly once and preserve pending checkout as
`pending` instead of guessing success or failure.
