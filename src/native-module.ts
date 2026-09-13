import type { Spec } from './specs/NativeNuxie';
import { NuxieError } from './errors';
export interface NativeBinding { module: Spec; platform: 'ios' | 'android' }

// Metro selects native-module.native.ts for iOS and Android. Keep server and
// web imports independent of React Native's native-only module registry.
export async function loadNative(): Promise<NativeBinding> {
  throw new NuxieError('unsupportedPlatform', 'Nuxie supports iOS and Android native builds');
}
