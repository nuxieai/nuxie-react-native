package ai.nuxie.reactnative

import ai.nuxie.sdk.*
import ai.nuxie.sdk.billing.PurchaseHandlingMode
import ai.nuxie.sdk.billing.RestoreResult
import ai.nuxie.sdk.features.FeatureAccess
import ai.nuxie.sdk.features.FeatureCheckPolicy
import ai.nuxie.sdk.features.FeatureInfo
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import java.lang.ref.WeakReference

@ReactModule(name = NuxieModule.NAME)
class NuxieModule(private val context: ReactApplicationContext) : NativeNuxieSpec(context), LifecycleEventListener {
  companion object {
    const val NAME = "Nuxie"
    private var owner = WeakReference<NuxieModule>(null)
    private var configurationKey: String? = null
  }
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
  private var session: String? = null
  private var snapshotJob: Job? = null
  private val purchases = NuxiePurchaseDelegateBridge(emitEvent = { name, value -> scope.launch { send(name, value) } })
  private val listener = object : NuxieListener {
    override fun onActivityEmitted(sdk: Nuxie, info: NuxieActivityInfo) {
      scope.launch { send("activity", mapOf("schemaVersion" to NuxieActivityInfo.SCHEMA_VERSION,
        "id" to info.id, "timestampMs" to info.timestampMillis, "receivedAtMs" to info.receivedAtMillis,
        "name" to info.name, "properties" to info.properties.mapValues { (_, v) -> when(v) {
          is NuxieActivityValue.String -> v.value; is NuxieActivityValue.Int -> v.value
          is NuxieActivityValue.Double -> v.value; is NuxieActivityValue.Bool -> v.value
        } })) }
    }
    override fun onAppActionRequested(sdk: Nuxie, action: AppAction) {
      scope.launch { send("appAction", mapOf("name" to action.name,
        "payload" to action.payload?.mapValues { (_, v) -> when(v) {
          is AppActionValue.String -> v.value; is AppActionValue.Int -> v.value
          is AppActionValue.Double -> v.value; is AppActionValue.Bool -> v.value
        } }, "experience" to mapOf("experienceId" to action.experience.experienceId,
          "experienceVersion" to action.experience.experienceVersion, "journeyId" to action.experience.journeyId))) }
    }
  }
  override fun getName() = NAME
  override fun initialize() { super.initialize(); context.addLifecycleEventListener(this) }
  override fun onHostResume() { /* Nuxie's application lifecycle observer tracks subsequent Activity resumes. */ }
  override fun onHostPause() {}
  override fun onHostDestroy() {}
  override fun invalidate() {
    context.removeLifecycleEventListener(this)
    scope.launch {
      snapshotJob?.cancel(); purchases.cancelPending("runtime_invalidated")
      session = null
      if (owner.get() === this@NuxieModule) { owner.clear(); if (Nuxie.listener === listener) Nuxie.listener = null }
      scope.cancel()
    }
    super.invalidate()
  }
  private fun send(name: String, payload: Map<String, Any?>) {
    val attached = session ?: return
    emitOnEvent(JSONObject(mapOf("session" to attached, "name" to name, "payload" to payload)).toString())
  }
  private fun run(promise: Promise, attached: String? = null, block: suspend () -> Any?) {
    scope.launch {
      try {
        if (attached != null && (attached != session || owner.get() !== this@NuxieModule)) throw BridgeFailure("sessionExpired", "Configure Nuxie in this runtime first")
        promise.resolve(block())
      } catch (error: Exception) { promise.reject((error as? BridgeFailure)?.code ?: "nativeError", error.message, error) }
    }
  }
  override fun configure(configuration: String, promise: Promise) = run(promise) {
    if (!android.os.Build.SUPPORTED_ABIS.any { it == "arm64-v8a" || it == "x86_64" }) throw BridgeFailure("unsupportedArchitecture", "Nuxie requires a 64-bit Android device")
    val input = JSONObject(configuration)
    if (input.getInt("contract") != 1) throw BridgeFailure("incompatibleBridge", "Rebuild the app with the matching native SDK")
    val attached = input.getString("session")
    val apiKey = input.getString("apiKey")
    require(apiKey.isNotBlank() && attached.isNotBlank())
    input.remove("session")
    val key = JSONObject(input.toMap().toSortedMap()).toString()
    if (owner.get() != null && owner.get() !== this) throw BridgeFailure("engineAlreadyAttached", "Another runtime owns Nuxie")
    if (configurationKey != null && configurationKey != key) throw BridgeFailure("alreadyConfigured", "Shutdown before changing configuration")
    if (Nuxie.isSetup && configurationKey == null) throw BridgeFailure("alreadyConfigured", "Nuxie was configured outside React Native")
    owner = WeakReference(this); session = attached
    purchases.cancelPending("session_replaced"); snapshotJob?.cancel()
    try {
      val config = NuxieConfiguration(apiKey = apiKey).apply {
        environment = if (input.optString("environment") == "development") NuxieEnvironment.DEVELOPMENT else NuxieEnvironment.PRODUCTION
        logLevel = when(input.optString("logLevel")) {
          "verbose" -> LogLevel.DEBUG; "debug" -> LogLevel.DEBUG; "info" -> LogLevel.INFO
          "error" -> LogLevel.ERROR; "none" -> LogLevel.NONE; else -> LogLevel.WARN
        }
        localeIdentifier = input.nullableString("localeIdentifier")
        purchaseHandlingMode = if (input.optString("purchaseHandlingMode") == "observer") PurchaseHandlingMode.APP_MANAGED else PurchaseHandlingMode.NUXIE_MANAGED
        purchaseDelegate = if (input.optBoolean("externalBilling")) purchases else null
      }
      if ((context.applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
        context.currentActivity?.intent?.getStringExtra("NUXIE_RN_API_ENDPOINT")?.let {
          config.testingOverrides.apiEndpoint = java.net.URL(it)
        }
      }
      Nuxie.listener = listener
      if (Nuxie.isSetup) Nuxie.setPurchaseDelegate(config.purchaseDelegate)
      else Nuxie.setup(context.currentActivity ?: context, config)
      configurationKey = key
      snapshotJob = scope.launch { Nuxie.features.snapshot.collect { send("features", it.toWire()) } }
      JSONObject(mapOf("session" to attached, "contract" to 1, "nativeVersion" to Nuxie.version,
        "snapshot" to Nuxie.features.snapshot.value.toWire())).toString()
    } catch (error: Exception) {
      if (!Nuxie.isSetup) { owner.clear(); session = null; if (Nuxie.listener === listener) Nuxie.listener = null }
      throw error
    }
  }
  override fun shutdown(session: String, promise: Promise) = run(promise, session) {
    snapshotJob?.cancel(); purchases.cancelPending("shutdown")
    withContext(Dispatchers.Default) { Nuxie.shutdown() }
    if (Nuxie.listener === listener) Nuxie.listener = null
    this.session = null; owner.clear(); configurationKey = null; null
  }
  override fun identify(session: String, customerId: String, properties: String, promise: Promise) = run(promise, session) {
    val options = JSONObject(properties)
    Nuxie.identify(customerId, options.optJSONObject("properties")?.toMap(), options.optJSONObject("propertiesSetOnce")?.toMap()); null
  }
  override fun reset(session: String, keepAnonymousId: Boolean, promise: Promise) = run(promise, session) { Nuxie.reset(keepAnonymousId); null }
  override fun getIdentity(session: String, promise: Promise) = run(promise, session) {
    JSONObject(mapOf("distinctId" to Nuxie.distinctId, "anonymousId" to Nuxie.anonymousId, "isIdentified" to Nuxie.isIdentified)).toString()
  }
  override fun setLocaleIdentifier(session: String, locale: String?, promise: Promise) = run(promise, session) { Nuxie.setLocaleIdentifier(locale); null }
  override fun trigger(session: String, event: String, properties: String, promise: Promise) = run(promise, session) { Nuxie.trigger(event, JSONObject(properties).toMap()); null }
  override fun dismiss(session: String, promise: Promise) = run(promise, session) { Nuxie.dismiss(); null }
  override fun hasFeature(session: String, featureId: String, options: String, promise: Promise) = run(promise, session) {
    val input = JSONObject(options)
    val result = Nuxie.hasFeature(featureId, input.optDouble("requiredBalance", 1.0), input.nullableString("entityId"),
      if (input.optString("policy") == "remote") FeatureCheckPolicy.REMOTE else FeatureCheckPolicy.CACHE_FIRST)
    JSONObject(result.toWire()).toString()
  }
  override fun consumeFeature(session: String, featureId: String, options: String, promise: Promise) = run(promise, session) {
    val input = JSONObject(options)
    val result = Nuxie.consumeFeature(featureId, input.getDouble("quantity"), input.getString("operationId"), input.nullableString("entityId"))
    JSONObject(mapOf("operationId" to result.operationId, "accepted" to result.accepted, "code" to result.code,
      "quantity" to result.quantity, "balance" to result.balance, "unlimited" to result.unlimited,
      "active" to result.active, "idempotentReplay" to result.idempotentReplay)).toString()
  }
  override fun restorePurchases(session: String, promise: Promise) = run(promise, session) {
    JSONObject(when(Nuxie.restorePurchases()) {
      RestoreResult.Restored -> mapOf("type" to "restored")
      RestoreResult.NoPurchases -> mapOf("type" to "noPurchases")
      is RestoreResult.Failed -> mapOf("type" to "failed", "message" to "Restore failed")
    }).toString()
  }
  override fun completePurchase(session: String, requestId: String, result: String, promise: Promise) = run(promise, session) { purchases.completePurchase(requestId, JSONObject(result).toMap()); null }
  override fun completeRestore(session: String, requestId: String, result: String, promise: Promise) = run(promise, session) { purchases.completeRestore(requestId, JSONObject(result).toMap()); null }
}
private class BridgeFailure(val code: String, message: String) : IllegalStateException(message)
private fun FeatureAccess.toWire() = mapOf("allowed" to allowed, "unlimited" to unlimited, "balance" to balance, "type" to when(type) {
  ai.nuxie.sdk.features.FeatureType.BOOLEAN -> "boolean"
  ai.nuxie.sdk.features.FeatureType.METERED -> "metered"
  ai.nuxie.sdk.features.FeatureType.CREDIT_SYSTEM -> "creditSystem"
})
private fun FeatureInfo.Snapshot.toWire(): Map<String, Any?> = mapOf("identityGeneration" to identityGeneration.toString(), "revision" to revision.toString(),
  "state" to when(state) { FeatureInfo.State.Unknown -> "unknown"; FeatureInfo.State.Ready -> "ready"; FeatureInfo.State.Reconciling -> "reconciling" },
  "all" to all.mapValues { it.value.toWire() })
private fun JSONObject.nullableString(key: String): String? = if (isNull(key)) null else getString(key)
private fun JSONObject.toMap(): Map<String, Any?> = keys().asSequence().associateWith { key -> jsonValue(get(key)) }
private fun jsonValue(value: Any?): Any? = when(value) {
  JSONObject.NULL -> null
  is JSONObject -> value.toMap()
  is JSONArray -> (0 until value.length()).map { jsonValue(value.get(it)) }
  else -> value
}
