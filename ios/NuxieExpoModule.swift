import ExpoModulesCore
import Foundation

#if canImport(Nuxie)
import Nuxie
#endif

public class NuxieExpoModule: Module {
  #if canImport(Nuxie)
  private lazy var purchaseDelegateBridge = NuxiePurchaseDelegateBridge { [weak self] eventName, payload in
    self?.sendEvent(eventName, payload)
  }
  @MainActor
  private lazy var delegateBridge = NuxieDelegateBridge { [weak self] eventName, payload in
    self?.sendEvent(eventName, payload)
  }
  #endif

  public func definition() -> ModuleDefinition {
    Name("NuxieExpo")

    Events(
      "onFeatureAccessChanged",
      "onActivity",
      "onAppAction",
      "onPurchaseRequest",
      "onRestoreRequest"
    )

    AsyncFunction("getDefaultApiKey") { (promise: Promise) in
      let key = Bundle.main.object(forInfoDictionaryKey: "NUXIE_API_KEY") as? String
      promise.resolve(key)
    }

    AsyncFunction("configure") { (
      apiKey: String,
      options: [String: Any]?,
      usePurchaseController: Bool?,
      _wrapperVersion: String?,
      promise: Promise
    ) in
      let normalizedApiKey = apiKey.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !normalizedApiKey.isEmpty else {
        promise.reject(NuxieExpoError.missingApiKey)
        return
      }

      #if canImport(Nuxie)
      Task { @MainActor in
        do {
          let config = self.makeConfiguration(
            apiKey: normalizedApiKey,
            options: options,
            usePurchaseController: usePurchaseController == true
          )
          NuxieSDK.shared.delegate = self.delegateBridge
          try NuxieSDK.shared.setup(with: config)
          promise.resolve(nil)
        } catch {
          promise.reject(error)
        }
      }
      #else
      promise.reject(NuxieExpoError.unavailable)
      #endif
    }

    AsyncFunction("shutdown") { (promise: Promise) in
      #if canImport(Nuxie)
      Task {
        self.purchaseDelegateBridge.cancelPending()
        await NuxieSDK.shared.shutdown()
        await MainActor.run {
          NuxieSDK.shared.delegate = nil
        }
        promise.resolve(nil)
      }
      #else
      promise.resolve(nil)
      #endif
    }

    AsyncFunction("identify") { (
      distinctId: String,
      userProperties: [String: Any]?,
      userPropertiesSetOnce: [String: Any]?,
      promise: Promise
    ) in
      #if canImport(Nuxie)
      NuxieSDK.shared.identify(
        distinctId,
        userProperties: userProperties,
        userPropertiesSetOnce: userPropertiesSetOnce
      )
      promise.resolve(nil)
      #else
      promise.reject(NuxieExpoError.unavailable)
      #endif
    }

    AsyncFunction("reset") { (keepAnonymousId: Bool?, promise: Promise) in
      #if canImport(Nuxie)
      NuxieSDK.shared.reset(keepAnonymousId: keepAnonymousId ?? false)
      promise.resolve(nil)
      #else
      promise.reject(NuxieExpoError.unavailable)
      #endif
    }

    AsyncFunction("getDistinctId") { (promise: Promise) in
      #if canImport(Nuxie)
      promise.resolve(NuxieSDK.shared.getDistinctId())
      #else
      promise.resolve("")
      #endif
    }

    AsyncFunction("getAnonymousId") { (promise: Promise) in
      #if canImport(Nuxie)
      promise.resolve(NuxieSDK.shared.getAnonymousId())
      #else
      promise.resolve("")
      #endif
    }

    AsyncFunction("getIsIdentified") { (promise: Promise) in
      #if canImport(Nuxie)
      promise.resolve(NuxieSDK.shared.isIdentified)
      #else
      promise.resolve(false)
      #endif
    }

    Function("trigger") { (
      eventName: String,
      properties: [String: Any]?
    ) in
      #if canImport(Nuxie)
      NuxieSDK.shared.trigger(eventName, properties: properties)
      #endif
    }

    AsyncFunction("dismiss") { (promise: Promise) in
      #if canImport(Nuxie)
      Task { @MainActor in
        await NuxieSDK.shared.dismiss()
        promise.resolve(nil)
      }
      #else
      promise.resolve(nil)
      #endif
    }

    AsyncFunction("setLocaleIdentifier") { (localeIdentifier: String?, promise: Promise) in
      #if canImport(Nuxie)
      Task {
        do {
          try await NuxieSDK.shared.setLocaleIdentifier(localeIdentifier)
          promise.resolve(nil)
        } catch {
          promise.reject(error)
        }
      }
      #else
      promise.reject(NuxieExpoError.unavailable)
      #endif
    }

    AsyncFunction("hasFeature") { (
      featureId: String,
      requiredBalance: Double?,
      entityId: String?,
      policy: String?,
      promise: Promise
    ) in
      #if canImport(Nuxie)
      Task {
        do {
          let access = try await NuxieSDK.shared.hasFeature(
            featureId,
            requiredBalance: requiredBalance ?? 1,
            entityId: entityId,
            policy: policy == "remote" ? .remote : .cacheFirst
          )
          promise.resolve(featureAccessDictionary(access))
        } catch {
          promise.reject(error)
        }
      }
      #else
      promise.reject(NuxieExpoError.unavailable)
      #endif
    }

    AsyncFunction("useFeature") { (
      featureId: String,
      amount: Double?,
      entityId: String?,
      metadata: [String: Any]?,
      promise: Promise
    ) in
      #if canImport(Nuxie)
      NuxieSDK.shared.useFeature(
        featureId,
        amount: amount ?? 1,
        entityId: entityId,
        metadata: metadata
      )
      promise.resolve(nil)
      #else
      promise.reject(NuxieExpoError.unavailable)
      #endif
    }

    AsyncFunction("useFeatureAndWait") { (
      featureId: String,
      amount: Double?,
      entityId: String?,
      setUsage: Bool?,
      metadata: [String: Any]?,
      promise: Promise
    ) in
      #if canImport(Nuxie)
      Task {
        do {
          let result = try await NuxieSDK.shared.useFeatureAndWait(
            featureId,
            amount: amount ?? 1,
            entityId: entityId,
            setUsage: setUsage ?? false,
            metadata: metadata
          )
          promise.resolve(featureUsageResultDictionary(result))
        } catch {
          promise.reject(error)
        }
      }
      #else
      promise.reject(NuxieExpoError.unavailable)
      #endif
    }

    AsyncFunction("completePurchase") { (
      requestId: String,
      result: [String: Any],
      promise: Promise
    ) in
      #if canImport(Nuxie)
      self.purchaseDelegateBridge.completePurchase(requestId: requestId, payload: result)
      #endif
      promise.resolve(nil)
    }

    AsyncFunction("completeRestore") { (
      requestId: String,
      result: [String: Any],
      promise: Promise
    ) in
      #if canImport(Nuxie)
      self.purchaseDelegateBridge.completeRestore(requestId: requestId, payload: result)
      #endif
      promise.resolve(nil)
    }
  }

  #if canImport(Nuxie)
  private func makeConfiguration(
    apiKey: String,
    options: [String: Any]?,
    usePurchaseController: Bool
  ) -> NuxieConfiguration {
    let config = NuxieConfiguration(apiKey: apiKey)

    if let environment = options?["environment"] as? String {
      config.environment = environment == "development" ? .development : .production
    }

    if let logLevel = options?["logLevel"] as? String {
      switch logLevel {
      case "verbose": config.logLevel = .verbose
      case "debug": config.logLevel = .debug
      case "info": config.logLevel = .info
      case "error": config.logLevel = .error
      case "none": config.logLevel = .none
      default: config.logLevel = .warning
      }
    }

    if let value = options?["enableConsoleLogging"] as? Bool {
      config.enableConsoleLogging = value
    }
    if let value = options?["redactSensitiveData"] as? Bool {
      config.redactSensitiveData = value
    }
    if options?.keys.contains("localeIdentifier") == true {
      config.localeIdentifier = options?["localeIdentifier"] as? String
    }
    if let value = options?["purchaseHandlingMode"] as? String {
      config.purchaseHandlingMode = value == "observer" ? .observer : .full
    }
    if let value = options?["testStoreEnabled"] as? Bool {
      config.testStoreEnabled = value
    }
    if usePurchaseController {
      config.purchaseDelegate = purchaseDelegateBridge
    }

    return config
  }
  #endif
}

#if canImport(Nuxie)
private func featureUsageResultDictionary(_ result: FeatureUsageResult) -> [String: Any] {
  let usage: Any
  if let value = result.usage {
    usage = [
      "current": value.current,
      "limit": nuxieNullable(value.limit),
      "remaining": nuxieNullable(value.remaining),
    ]
  } else {
    usage = NSNull()
  }

  return [
    "success": result.success,
    "featureId": result.featureId,
    "amountUsed": result.amountUsed,
    "message": nuxieNullable(result.message),
    "usage": usage,
    "authoritativeAccess": nuxieNullable(result.authoritativeAccess.map(featureAccessDictionary)),
  ]
}
#endif

enum NuxieExpoError: Error, LocalizedError {
  case unavailable
  case missingApiKey

  var errorDescription: String? {
    switch self {
    case .unavailable:
      return "Nuxie iOS SDK is unavailable in this build."
    case .missingApiKey:
      return "Nuxie API key is required."
    }
  }
}
