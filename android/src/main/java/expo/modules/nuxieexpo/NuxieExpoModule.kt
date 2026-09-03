package expo.modules.nuxieexpo

import ai.nuxie.sdk.AppAction
import ai.nuxie.sdk.AppActionValue
import ai.nuxie.sdk.LogLevel
import ai.nuxie.sdk.Nuxie
import ai.nuxie.sdk.NuxieActivityInfo
import ai.nuxie.sdk.NuxieActivityValue
import ai.nuxie.sdk.NuxieConfiguration
import ai.nuxie.sdk.NuxieEnvironment
import ai.nuxie.sdk.NuxieListener
import ai.nuxie.sdk.billing.PurchaseHandlingMode
import ai.nuxie.sdk.features.FeatureAccess
import ai.nuxie.sdk.features.FeatureCheckPolicy
import ai.nuxie.sdk.features.FeatureType
import ai.nuxie.sdk.features.FeatureUsageResult
import android.content.pm.PackageManager
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.nuxieexpo.bridges.NuxiePurchaseDelegateBridge
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class NuxieExpoModule : Module() {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
  private val purchaseDelegateBridge = NuxiePurchaseDelegateBridge(::emitModuleEvent)
  private val sdkListener = object : NuxieListener {
    override fun featureAccessDidChange(
      featureId: String,
      oldAccess: FeatureAccess?,
      newAccess: FeatureAccess,
    ) {
      emitModuleEvent(
        "onFeatureAccessChanged",
        mapOf(
          "featureId" to featureId,
          "from" to oldAccess?.toMap(),
          "to" to newAccess.toMap(),
          "timestampMs" to System.currentTimeMillis(),
        ),
      )
    }

    override fun onActivityEmitted(sdk: Nuxie, info: NuxieActivityInfo) {
      emitModuleEvent("onActivity", info.toMap())
    }

    override fun onAppActionRequested(sdk: Nuxie, action: AppAction) {
      emitModuleEvent("onAppAction", action.toMap())
    }
  }

  override fun definition() = ModuleDefinition {
    Name("NuxieExpo")

    Events(
      "onFeatureAccessChanged",
      "onActivity",
      "onAppAction",
      "onPurchaseRequest",
      "onRestoreRequest",
    )

    AsyncFunction("getDefaultApiKey") { promise: Promise ->
      val context = appContext.reactContext?.applicationContext
      if (context == null) {
        promise.resolve(null)
        return@AsyncFunction
      }

      try {
        val appInfo = context.packageManager.getApplicationInfo(
          context.packageName,
          PackageManager.GET_META_DATA,
        )
        promise.resolve(appInfo.metaData?.getString("NUXIE_API_KEY"))
      } catch (_: Throwable) {
        promise.resolve(null)
      }
    }

    AsyncFunction("configure") {
      apiKey: String,
      options: Map<String, Any?>?,
      usePurchaseController: Boolean?,
      _wrapperVersion: String?,
      promise: Promise,
      ->
      if (apiKey.isBlank()) {
        promise.reject("MISSING_API_KEY", "Nuxie API key is required", null)
        return@AsyncFunction
      }

      val context = appContext.reactContext?.applicationContext
      if (context == null) {
        promise.reject("NO_CONTEXT", "React context is unavailable", null)
        return@AsyncFunction
      }

      try {
        Nuxie.listener = sdkListener
        Nuxie.setup(
          context,
          buildConfiguration(apiKey, options, usePurchaseController == true),
        )
        promise.resolve(null)
      } catch (error: Throwable) {
        if (!Nuxie.isSetup && Nuxie.listener === sdkListener) {
          Nuxie.listener = null
        }
        promise.reject("CONFIGURE_FAILED", error.message, error)
      }
    }

    AsyncFunction("shutdown") { promise: Promise ->
      purchaseDelegateBridge.cancelPending("sdk_shutdown")
      scope.launch {
        runCatching {
          withContext(Dispatchers.Default) { Nuxie.shutdown() }
        }.onSuccess {
          promise.resolve(null)
        }.onFailure { error ->
          promise.reject("SHUTDOWN_FAILED", error.message, error)
        }
      }
    }

    AsyncFunction("identify") {
      distinctId: String,
      userProperties: Map<String, Any?>?,
      userPropertiesSetOnce: Map<String, Any?>?,
      promise: Promise,
      ->
      runCatching {
        Nuxie.identify(
          distinctId = distinctId,
          userProperties = userProperties,
          userPropertiesSetOnce = userPropertiesSetOnce,
        )
      }.onSuccess {
        promise.resolve(null)
      }.onFailure { error ->
        promise.reject("IDENTIFY_FAILED", error.message, error)
      }
    }

    AsyncFunction("reset") { keepAnonymousId: Boolean?, promise: Promise ->
      runCatching {
        Nuxie.reset(keepAnonymousId = keepAnonymousId ?: false)
      }.onSuccess {
        promise.resolve(null)
      }.onFailure { error ->
        promise.reject("RESET_FAILED", error.message, error)
      }
    }

    AsyncFunction("getDistinctId") { promise: Promise ->
      promise.resolve(Nuxie.distinctId)
    }

    AsyncFunction("getAnonymousId") { promise: Promise ->
      promise.resolve(Nuxie.anonymousId)
    }

    AsyncFunction("getIsIdentified") { promise: Promise ->
      promise.resolve(Nuxie.isIdentified)
    }

    Function("trigger") {
      eventName: String,
      properties: Map<String, Any?>?,
      ->
      Nuxie.trigger(eventName, properties)
    }

    AsyncFunction("dismiss") { promise: Promise ->
      scope.launch {
        runCatching { Nuxie.dismiss() }
          .onSuccess { promise.resolve(null) }
          .onFailure { error -> promise.reject("DISMISS_FAILED", error.message, error) }
      }
    }

    AsyncFunction("setLocaleIdentifier") { localeIdentifier: String?, promise: Promise ->
      scope.launch {
        runCatching { Nuxie.setLocaleIdentifier(localeIdentifier) }
          .onSuccess { promise.resolve(null) }
          .onFailure { error -> promise.reject("SET_LOCALE_FAILED", error.message, error) }
      }
    }

    AsyncFunction("hasFeature") {
      featureId: String,
      requiredBalance: Double?,
      entityId: String?,
      policy: String?,
      promise: Promise,
      ->
      scope.launch {
        runCatching {
          Nuxie.hasFeature(
            featureId = featureId,
            requiredBalance = requiredBalance ?: 1.0,
            entityId = entityId,
            policy = if (policy == "remote") {
              FeatureCheckPolicy.REMOTE
            } else {
              FeatureCheckPolicy.CACHE_FIRST
            },
          )
        }.onSuccess { access ->
          promise.resolve(access.toMap())
        }.onFailure { error ->
          promise.reject("HAS_FEATURE_FAILED", error.message, error)
        }
      }
    }

    AsyncFunction("useFeature") {
      featureId: String,
      amount: Double?,
      entityId: String?,
      metadata: Map<String, Any?>?,
      promise: Promise,
      ->
      runCatching {
        Nuxie.useFeature(
          featureId = featureId,
          amount = amount ?: 1.0,
          entityId = entityId,
          metadata = metadata,
        )
      }.onSuccess {
        promise.resolve(null)
      }.onFailure { error ->
        promise.reject("USE_FEATURE_FAILED", error.message, error)
      }
    }

    AsyncFunction("useFeatureAndWait") {
      featureId: String,
      amount: Double?,
      entityId: String?,
      setUsage: Boolean?,
      metadata: Map<String, Any?>?,
      promise: Promise,
      ->
      scope.launch {
        runCatching {
          Nuxie.useFeatureAndWait(
            featureId = featureId,
            amount = amount ?: 1.0,
            entityId = entityId,
            setUsage = setUsage ?: false,
            metadata = metadata,
          )
        }.onSuccess { result ->
          promise.resolve(result.toMap())
        }.onFailure { error ->
          promise.reject("USE_FEATURE_AND_WAIT_FAILED", error.message, error)
        }
      }
    }

    AsyncFunction("completePurchase") {
      requestId: String,
      result: Map<String, Any?>,
      promise: Promise,
      ->
      purchaseDelegateBridge.completePurchase(requestId, result)
      promise.resolve(null)
    }

    AsyncFunction("completeRestore") {
      requestId: String,
      result: Map<String, Any?>,
      promise: Promise,
      ->
      purchaseDelegateBridge.completeRestore(requestId, result)
      promise.resolve(null)
    }

    OnDestroy {
      purchaseDelegateBridge.cancelPending("module_destroyed")
      if (Nuxie.listener === sdkListener) {
        Nuxie.listener = null
      }
      scope.cancel()
    }
  }

  private fun buildConfiguration(
    apiKey: String,
    options: Map<String, Any?>?,
    usePurchaseController: Boolean,
  ): NuxieConfiguration = NuxieConfiguration(apiKey).apply {
    environment = if (options?.get("environment") == "development") {
      NuxieEnvironment.DEVELOPMENT
    } else {
      NuxieEnvironment.PRODUCTION
    }
    logLevel = when (options?.get("logLevel") as? String) {
      "verbose", "debug" -> LogLevel.DEBUG
      "info" -> LogLevel.INFO
      "error" -> LogLevel.ERROR
      "none" -> LogLevel.NONE
      else -> LogLevel.WARN
    }
    if (options?.containsKey("localeIdentifier") == true) {
      localeIdentifier = options["localeIdentifier"] as? String
    }
    purchaseHandlingMode = if (options?.get("purchaseHandlingMode") == "observer") {
      PurchaseHandlingMode.APP_MANAGED
    } else {
      PurchaseHandlingMode.NUXIE_MANAGED
    }
    if (usePurchaseController) {
      purchaseDelegate = purchaseDelegateBridge
    }
  }

  private fun emitModuleEvent(eventName: String, payload: Map<String, Any?>) {
    sendEvent(eventName, payload)
  }

}

private fun FeatureType.toJsValue(): String = when (this) {
  FeatureType.BOOLEAN -> "boolean"
  FeatureType.METERED -> "metered"
  FeatureType.CREDIT_SYSTEM -> "creditSystem"
}

private fun FeatureAccess.toMap(): Map<String, Any?> = mapOf(
  "allowed" to allowed,
  "unlimited" to unlimited,
  "balance" to balance,
  "type" to type.toJsValue(),
)

private fun FeatureUsageResult.toMap(): Map<String, Any?> = mapOf(
  "success" to success,
  "featureId" to featureId,
  "amountUsed" to amountUsed,
  "message" to message,
  "usage" to usage?.let { value ->
    mapOf(
      "current" to value.current,
      "limit" to value.limit,
      "remaining" to value.remaining,
    )
  },
  "authoritativeAccess" to authoritativeAccess?.toMap(),
)

private fun NuxieActivityInfo.toMap(): Map<String, Any?> = mapOf(
  "schemaVersion" to NuxieActivityInfo.SCHEMA_VERSION,
  "id" to id,
  "timestampMs" to timestampMillis,
  "receivedAtMs" to receivedAtMillis,
  "name" to name,
  "properties" to properties.mapValues { (_, value) -> value.toJsValue() },
)

private fun NuxieActivityValue.toJsValue(): Any = when (this) {
  is NuxieActivityValue.String -> value
  is NuxieActivityValue.Int -> value
  is NuxieActivityValue.Double -> value
  is NuxieActivityValue.Bool -> value
}

private fun AppAction.toMap(): Map<String, Any?> = mapOf(
  "name" to name,
  "payload" to payload?.mapValues { (_, value) -> value.toJsValue() },
  "experience" to mapOf(
    "experienceId" to experience.experienceId,
    "experienceVersion" to experience.experienceVersion,
    "journeyId" to experience.journeyId,
  ),
)

private fun AppActionValue.toJsValue(): Any = when (this) {
  is AppActionValue.String -> value
  is AppActionValue.Int -> value
  is AppActionValue.Double -> value
  is AppActionValue.Bool -> value
}
