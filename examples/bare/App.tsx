import React from 'react';
import { Lab } from '../shared/lab';
import defaults from '../shared/defaults';
import { V3Probe } from '../shared/v3-probe-view';
export default function App() {
  return __DEV__ && defaults.v3ProbeUrl
    ? <V3Probe endpoint={defaults.v3ProbeUrl} />
    : <Lab host="React Native" defaults={defaults} />;
}
