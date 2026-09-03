import { useEffect } from "react";
import type { NuxieClientEventMap } from "./client";
import { useNuxieClient } from "./react-context";

export interface NuxieEventCallbacks {
  onFeatureAccessChanged?: (payload: NuxieClientEventMap["featureAccessChanged"]) => void;
  onActivity?: (payload: NuxieClientEventMap["activity"]) => void;
  onAppAction?: (payload: NuxieClientEventMap["appAction"]) => void;
  onPurchaseRequest?: (payload: NuxieClientEventMap["purchaseRequest"]) => void;
  onRestoreRequest?: (payload: NuxieClientEventMap["restoreRequest"]) => void;
}

export function useNuxieEvents(callbacks: NuxieEventCallbacks = {}): void {
  const client = useNuxieClient();

  useEffect(() => {
    const unsubscribers: Array<() => void> = [];

    if (callbacks.onFeatureAccessChanged != null) {
      unsubscribers.push(client.on("featureAccessChanged", callbacks.onFeatureAccessChanged));
    }
    if (callbacks.onActivity != null) {
      unsubscribers.push(client.on("activity", callbacks.onActivity));
    }
    if (callbacks.onAppAction != null) {
      unsubscribers.push(client.on("appAction", callbacks.onAppAction));
    }
    if (callbacks.onPurchaseRequest != null) {
      unsubscribers.push(client.on("purchaseRequest", callbacks.onPurchaseRequest));
    }
    if (callbacks.onRestoreRequest != null) {
      unsubscribers.push(client.on("restoreRequest", callbacks.onRestoreRequest));
    }

    return () => {
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
    };
  }, [client, callbacks]);
}
