import type { TurboModule, CodegenTypes } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/** Private wire protocol. Recursive application JSON is explicitly serialized. */
export interface Spec extends TurboModule {
  configure(configuration: string): Promise<string>;
  shutdown(session: string): Promise<void>;
  identify(session: string, customerId: string, properties: string): Promise<void>;
  reset(session: string, keepAnonymousId: boolean): Promise<void>;
  getIdentity(session: string): Promise<string>;
  setLocaleIdentifier(session: string, locale: string | null): Promise<void>;
  trigger(session: string, event: string, properties: string): Promise<void>;
  dismiss(session: string): Promise<void>;
  hasFeature(session: string, featureId: string, options: string): Promise<string>;
  consumeFeature(session: string, featureId: string, options: string): Promise<string>;
  restorePurchases(session: string): Promise<string>;
  completePurchase(session: string, requestId: string, result: string): Promise<void>;
  completeRestore(session: string, requestId: string, result: string): Promise<void>;
  readonly onEvent: CodegenTypes.EventEmitter<string>;
}

export default TurboModuleRegistry.get<Spec>('Nuxie');
