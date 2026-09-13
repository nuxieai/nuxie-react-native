import { createContext, useContext, useEffect, useRef, useSyncExternalStore } from 'react';
import type { PropsWithChildren } from 'react';
import type { AppAction, FeatureSelection, NuxieActivity, NuxieClient, NuxieConfiguration } from './types';
import { nuxie } from './singleton';
const Context = createContext<NuxieClient>(nuxie);
export interface NuxieProviderProps extends PropsWithChildren {
  client?: NuxieClient;
  configuration?: NuxieConfiguration;
  onActivity?: (activity: NuxieActivity) => void;
  onAppAction?: (action: AppAction) => void;
  onError?: (error: Error) => void;
}
export function NuxieProvider({ client = nuxie, configuration, children, ...handlers }: NuxieProviderProps) {
  const current = useRef(handlers); current.current = handlers;
  useEffect(() => {
    const off = [client.onActivity(v => current.current.onActivity?.(v)),
      client.onAppAction(v => current.current.onAppAction?.(v)), client.onError(v => current.current.onError?.(v))];
    return () => off.forEach(unsubscribe => unsubscribe());
  }, [client]);
  useEffect(() => {
    let mounted = true;
    if (configuration) void client.configure(configuration).catch(error => { if (mounted) { try { current.current.onError?.(error); } catch { /* Consumer error handler must not create an unhandled rejection. */ } } });
    return () => { mounted = false; };
  }, [client, configuration]);
  return <Context.Provider value={client}>{children}</Context.Provider>;
}
export function useNuxie() { return useContext(Context); }
export function useNuxieStatus() { const client = useNuxie(); return useSyncExternalStore(client.subscribeStatus, client.getStatus, client.getStatus); }
export function useFeatures() { const client = useNuxie(); return useSyncExternalStore(client.subscribeFeatures, client.getFeatures, client.getFeatures); }
export function useFeature(featureId: string): FeatureSelection {
  const client = useNuxie();
  const previous = useRef<FeatureSelection | null>(null);
  const get = () => {
    const snapshot = client.getFeatures(), access = Object.hasOwn(snapshot.all, featureId) ? snapshot.all[featureId] : null;
    if (previous.current?.state !== snapshot.state || previous.current.access !== access) previous.current = Object.freeze({ state: snapshot.state, access });
    return previous.current;
  };
  return useSyncExternalStore(client.subscribeFeatures, get, get);
}
export function useNuxieActivity(handler: (activity: NuxieActivity) => void) {
  const client = useNuxie(), current = useRef(handler); current.current = handler;
  useEffect(() => client.onActivity(value => current.current(value)), [client]);
}
export function useNuxieAppAction(handler: (action: AppAction) => void) {
  const client = useNuxie(), current = useRef(handler); current.current = handler;
  useEffect(() => client.onAppAction(value => current.current(value)), [client]);
}
