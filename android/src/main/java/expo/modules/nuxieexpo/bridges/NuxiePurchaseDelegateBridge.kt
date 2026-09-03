package expo.modules.nuxieexpo.bridges

import ai.nuxie.sdk.billing.NuxiePurchaseDelegate
import ai.nuxie.sdk.billing.PurchaseResult
import ai.nuxie.sdk.billing.RestoreResult
import ai.nuxie.sdk.billing.StoreProduct
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.withTimeoutOrNull

class NuxiePurchaseDelegateBridge(
  private val emitEvent: (eventName: String, payload: Map<String, Any?>) -> Unit,
  private val timeoutMs: Long = 60_000,
) : NuxiePurchaseDelegate {
  private val purchaseRequests = ConcurrentHashMap<String, CompletableDeferred<PurchaseResult>>()
  private val restoreRequests = ConcurrentHashMap<String, CompletableDeferred<RestoreResult>>()

  override suspend fun purchase(product: StoreProduct): PurchaseResult {
    val requestId = UUID.randomUUID().toString()
    val deferred = CompletableDeferred<PurchaseResult>()
    purchaseRequests[requestId] = deferred

    emitEvent(
      "onPurchaseRequest",
      mapOf(
        "request_id" to requestId,
        "platform" to "android",
        "product_id" to product.productId,
        "store_product_id" to product.storeProductId,
        "base_plan_id" to product.basePlanId,
        "purchase_option_id" to product.purchaseOptionId,
        "offer_id" to product.offerId,
        "placement_id" to product.placementId,
        "display_name" to product.rawProduct?.name,
        "display_price" to null,
        "timestamp_ms" to System.currentTimeMillis(),
      ),
    )

    return try {
      withTimeoutOrNull(timeoutMs) { deferred.await() }
        ?: PurchaseResult.Failed(bridgeError("purchase_timeout"))
    } finally {
      purchaseRequests.remove(requestId)
    }
  }

  override suspend fun restorePurchases(): RestoreResult {
    val requestId = UUID.randomUUID().toString()
    val deferred = CompletableDeferred<RestoreResult>()
    restoreRequests[requestId] = deferred

    emitEvent(
      "onRestoreRequest",
      mapOf(
        "request_id" to requestId,
        "platform" to "android",
        "timestamp_ms" to System.currentTimeMillis(),
      ),
    )

    return try {
      withTimeoutOrNull(timeoutMs) { deferred.await() }
        ?: RestoreResult.Failed(bridgeError("restore_timeout"))
    } finally {
      restoreRequests.remove(requestId)
    }
  }

  fun completePurchase(requestId: String, payload: Map<String, Any?>) {
    purchaseRequests.remove(requestId)?.complete(purchaseResult(payload))
  }

  fun completeRestore(requestId: String, payload: Map<String, Any?>) {
    restoreRequests.remove(requestId)?.complete(restoreResult(payload))
  }

  fun cancelPending(reason: String) {
    purchaseRequests.values.forEach { request ->
      request.complete(PurchaseResult.Failed(bridgeError(reason)))
    }
    restoreRequests.values.forEach { request ->
      request.complete(RestoreResult.Failed(bridgeError(reason)))
    }
    purchaseRequests.clear()
    restoreRequests.clear()
  }

  private fun purchaseResult(payload: Map<String, Any?>): PurchaseResult =
    when ((payload["type"] as? String)?.lowercase()) {
      "purchased" -> PurchaseResult.Purchased
      "cancelled" -> PurchaseResult.Cancelled
      "pending" -> PurchaseResult.Pending
      else -> PurchaseResult.Failed(
        bridgeError((payload["message"] as? String) ?: "purchase_failed"),
      )
    }

  private fun restoreResult(payload: Map<String, Any?>): RestoreResult =
    when ((payload["type"] as? String)?.lowercase()) {
      "restored" -> RestoreResult.Restored
      "no_purchases" -> RestoreResult.NoPurchases
      else -> RestoreResult.Failed(
        bridgeError((payload["message"] as? String) ?: "restore_failed"),
      )
    }

  private fun bridgeError(message: String): Throwable = IllegalStateException(message)
}
