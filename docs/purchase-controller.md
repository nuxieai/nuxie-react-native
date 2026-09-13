# Purchase controllers

Use native billing unless your application already owns a purchase-provider integration. External billing is a configuration-time commitment; provider unmount does not revoke it.

```ts
import type { PurchaseController, PurchaseResult, RestoreResult } from '@nuxie/react-native';

const controller: PurchaseController = {
  async purchase(product): Promise<PurchaseResult> {
    return billingAdapter.purchaseExactOffer(product);
  },
  async restorePurchases(): Promise<RestoreResult> {
    return billingAdapter.restore();
  },
};

await nuxie.configure({ apiKeys, billing: { mode: 'external', controller } });
```

`billingAdapter`, `apiKeys`, and the configured `nuxie` import belong to the host. Map the provider's actual outcome:

| Purchase | Restore |
| --- | --- |
| `{ type: 'purchased' }` | `{ type: 'restored' }` |
| `{ type: 'cancelled' }` | `{ type: 'noPurchases' }` |
| `{ type: 'pending' }` | `{ type: 'failed', message }` |
| `{ type: 'failed', message }` | |

The `StoreProduct` includes Nuxie and store product IDs, platform, selected base plan, purchase option, offer, placement, available display terms, and iOS introductory eligibility JWS. Fields unavailable on a platform are null. Resolve the exact selected offer with your provider. If the provider cannot express it, return a failure instead of buying another offer.

Cancellation, pending approval, and failure are distinct. A successful external response does not manufacture a receipt or grant Features. Observe the native Feature projection for access.

The wrapper keeps transport IDs private and completes each request at most once. Native watchdogs fail abandoned requests; invalidation/shutdown cancels pending JavaScript callbacks. Late results cannot settle requests in a different runtime session. Application exceptions become failed purchase/restore results.

With native billing, `handling: 'full'` delegates purchase completion to Nuxie. `handling: 'observer'` leaves native transaction completion with the host. This is separate from selecting an external JavaScript controller.
