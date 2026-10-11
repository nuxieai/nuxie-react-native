import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { nuxie } from '@nuxie/react-native';
import { runV3Probe } from './v3-probe';

export function V3Probe({ endpoint }: { endpoint: string }) {
  const started = useRef(false);
  const [status, setStatus] = useState('Collecting native v3 observations');
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void runV3Probe(nuxie, endpoint).then(
      () => setStatus('Native observations retained; inspect the independent verdict'),
      error => setStatus(`Probe failed: ${error instanceof Error ? error.message : String(error)}`),
    );
  }, [endpoint]);
  return <View><Text>{status}</Text></View>;
}
