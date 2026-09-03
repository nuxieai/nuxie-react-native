import { useCallback, useEffect, useMemo, useState } from "react";
import type { FeatureAccess, FeatureCheckPolicy } from "./types";
import { useNuxieClient } from "./react-context";

export interface UseFeatureOptions {
  requiredBalance?: number;
  entityId?: string;
  policy?: FeatureCheckPolicy;
}

export interface UseFeatureResult {
  value: FeatureAccess | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<FeatureAccess>;
}

export function useFeature(featureId: string, options: UseFeatureOptions = {}): UseFeatureResult {
  const client = useNuxieClient();
  const [value, setValue] = useState<FeatureAccess | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    const access = await client.hasFeature(featureId, {
      requiredBalance: options.requiredBalance,
      entityId: options.entityId,
      policy: "remote",
    });
    setValue(access);
    setError(null);
    return access;
  }, [client, featureId, options.entityId, options.requiredBalance]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    void (async () => {
      try {
        const access = await client.hasFeature(featureId, {
          requiredBalance: options.requiredBalance,
          entityId: options.entityId,
          policy: options.policy,
        });
        if (!cancelled) {
          setValue(access);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError : new Error("feature_check_failed"));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    const unsubscribe = client.on("featureAccessChanged", (payload) => {
      if (payload.featureId !== featureId) {
        return;
      }
      setValue(payload.to);
      setError(null);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [client, featureId, options.entityId, options.policy, options.requiredBalance]);

  return useMemo(
    () => ({
      value,
      isLoading,
      error,
      refresh,
    }),
    [value, isLoading, error, refresh],
  );
}
