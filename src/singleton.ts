import { createClient } from './client';
import { loadNative } from './native-module';
export const nuxie = createClient(loadNative);
