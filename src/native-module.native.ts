import { Platform } from 'react-native';
import module from './specs/NativeNuxie';
import { NuxieError } from './errors';
import type { NativeBinding } from './native-module';

export async function loadNative(): Promise<NativeBinding> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') throw new NuxieError('unsupportedPlatform', 'Nuxie supports iOS and Android native builds');
  if (!module) throw new NuxieError('nativeUnavailable', 'Nuxie native module is missing. Rebuild your app; Expo Go cannot load Nuxie.');
  return { module, platform: Platform.OS };
}
