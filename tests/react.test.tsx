import { expect, test } from 'bun:test';
import React, { StrictMode } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import { NuxieProvider, useFeature, useNuxieActivity } from '../src/react-context';
import { createClient } from '../src/client';
import { config, empty, fixture } from './native-fixture';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

test('Strict Mode setup and unmount leave native session and purchase ownership intact', async () => {
  const native = fixture(), client = createClient(async () => ({ module: native.module, platform: 'ios' }));
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<StrictMode><NuxieProvider client={client} configuration={config}><></></NuxieProvider></StrictMode>); });
  expect(native.calls.filter(c => c.method === 'configure')).toHaveLength(1);
  await act(async () => tree.unmount());
  expect(native.calls.filter(c => c.method === 'shutdown')).toHaveLength(0);
  expect(client.getStatus().state).toBe('configured');
});

test('Feature selector does not fetch or rerender for unrelated native access changes', async () => {
  const native = fixture(), client = createClient(async () => ({ module: native.module, platform: 'ios' }));
  await client.configure(config); let renders = 0;
  function Selected() { renders++; const selected = useFeature('a'); return <>{selected.state}</>; }
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<NuxieProvider client={client}><Selected /></NuxieProvider>); });
  const meter = { allowed: true, balance: 1, unlimited: false, type: 'metered' } as const;
  await act(async () => native.snapshot({ ...empty, revision: '1', state: 'ready', all: { a: meter } }));
  const before = renders;
  await act(async () => native.snapshot({ ...empty, revision: '2', state: 'ready', all: { a: meter, b: meter } }));
  expect(renders).toBe(before);
  expect(native.calls.filter(c => c.method === 'hasFeature')).toHaveLength(0);
  await act(async () => tree.unmount());
});

test('event hooks use the latest callback and unsubscribe on unmount', async () => {
  const native = fixture(), client = createClient(async () => ({ module: native.module, platform: 'ios' }));
  await client.configure(config); const values: string[] = [];
  function Events({ label }: { label: string }) { useNuxieActivity(() => values.push(label)); return null; }
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<NuxieProvider client={client}><Events label="old" /></NuxieProvider>); });
  await act(async () => tree.update(<NuxieProvider client={client}><Events label="new" /></NuxieProvider>));
  const event = { schemaVersion: 1, id: 'id', name: '$experience_shown', timestampMs: 0, receivedAtMs: 0, properties: {} };
  native.emit('activity', event);
  await act(async () => tree.unmount()); native.emit('activity', event);
  expect(values).toEqual(['new']);
});
