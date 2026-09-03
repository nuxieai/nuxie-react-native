import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { NuxieClient } from "./client";
import { Nuxie } from "./singleton";
import type { NuxieConfigureOptions, NuxiePurchaseController } from "./types";

interface NuxieContextValue {
  client: NuxieClient;
}

const NuxieContext = createContext<NuxieContextValue | null>(null);

export interface NuxieProviderProps {
  children: ReactNode;
  config?: NuxieConfigureOptions;
  purchaseController?: NuxiePurchaseController | null;
  client?: NuxieClient;
  onConfigureError?: (error: unknown) => void;
}

export function NuxieProvider({
  children,
  config,
  purchaseController = null,
  client = Nuxie,
  onConfigureError,
}: NuxieProviderProps): any {
  const configureErrorRef = useRef(onConfigureError);
  configureErrorRef.current = onConfigureError;
  const stableConfig = useMemo<NuxieConfigureOptions | null>(() => {
    if (config == null) {
      return null;
    }
    return {
      apiKey: config.apiKey,
      environment: config.environment,
      logLevel: config.logLevel,
      enableConsoleLogging: config.enableConsoleLogging,
      redactSensitiveData: config.redactSensitiveData,
      localeIdentifier: config.localeIdentifier,
      purchaseHandlingMode: config.purchaseHandlingMode,
      testStoreEnabled: config.testStoreEnabled,
      usePurchaseController: config.usePurchaseController,
    };
  }, [
    config?.apiKey,
    config?.environment,
    config?.logLevel,
    config?.enableConsoleLogging,
    config?.redactSensitiveData,
    config?.localeIdentifier,
    config?.purchaseHandlingMode,
    config?.testStoreEnabled,
    config?.usePurchaseController,
  ]);

  useEffect(() => {
    client.setPurchaseController(purchaseController);
    return () => {
      if (purchaseController != null) {
        client.setPurchaseController(null);
      }
    };
  }, [client, purchaseController]);

  useEffect(() => {
    if (stableConfig == null) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        await client.configure(stableConfig);
      } catch (error) {
        if (cancelled) {
          return;
        }
        configureErrorRef.current?.(error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, stableConfig]);

  const value = useMemo<NuxieContextValue>(() => ({ client }), [client]);
  return <NuxieContext.Provider value={value}>{children}</NuxieContext.Provider>;
}

export function useNuxieClient(): NuxieClient {
  const ctx = useContext(NuxieContext) as NuxieContextValue | null;
  return ctx?.client ?? Nuxie;
}
