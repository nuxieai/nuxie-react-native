import React, { useState, useEffect, useRef } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, useColorScheme, Text, TextInput, View } from 'react-native';
import { NuxieProvider, useFeature, useFeatures, useNuxie, useNuxieStatus } from '@nuxie/react-native';
import { runChecks } from './run-checks';
import { palette } from './theme';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import type { NuxieConfiguration } from '@nuxie/react-native';

export interface LabDefaults { iosKey?: string; androidKey?: string; customerId?: string; featureId?: string; event?: string; entityA?: string; entityB?: string; validateOnConnect?: boolean }
export function Lab({ host, defaults = {} }: { host: string; defaults?: LabDefaults }) {
  const styles = useStyles();
  const [configuration, setConfiguration] = useState<NuxieConfiguration | undefined>(() => defaults.iosKey && defaults.androidKey ? { apiKeys: { ios: defaults.iosKey, android: defaults.androidKey }, environment: 'development', logLevel: 'debug' } : undefined);
  const [ios, setIos] = useState(defaults.iosKey ?? ''), [android, setAndroid] = useState(defaults.androidKey ?? '');
  const [log, setLog] = useState<string[]>([]);
  const record = (label: string, value?: unknown) => { console.info('[Nuxie Lab]', label, value ?? ''); setLog(previous => [`${label}${value === undefined ? '' : ` · ${typeof value === 'string' ? value : JSON.stringify(value)}`}`, ...previous].slice(0, 20)); };
  return <SafeAreaProvider><SafeAreaView style={styles.screen}><NuxieProvider configuration={configuration}
    onError={error => record('Error', error.message)}
    onActivity={event => record(event.name)} onAppAction={action => record('App Action', action.name)}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.eyebrow}>NUXIE / SDK LAB</Text>
      <Text style={styles.title}>Make every{ '\n' }moment count.</Text>
      <Text style={styles.subtitle}>{host} · {Platform.OS} · one native SDK</Text>
      {!configuration && <Card title="Connect your development app" description="Use the public iOS and Android keys from your Nuxie app.">
        <Field label="iOS public key" value={ios} onChangeText={setIos} />
        <Field label="Android public key" value={android} onChangeText={setAndroid} />
        <Action label="Connect Nuxie" disabled={!ios.trim() || !android.trim()} onPress={() => setConfiguration({ apiKeys: { ios, android }, environment: 'development', logLevel: 'debug' })} />
      </Card>}
      <Console defaults={defaults} record={record} onDisconnect={() => setConfiguration(undefined)} />
      <Card title="Live activity" description="Native events and App Actions appear here as they happen.">
        {log.length ? log.map((entry, index) => <Text selectable style={styles.log} key={`${index}-${entry}`}>{entry}</Text>) : <Text style={styles.muted}>Waiting for your first moment.</Text>}
      </Card>
      <Text style={styles.footer}>Experiences run natively. Your app stays yours.</Text>
    </ScrollView>
  </NuxieProvider></SafeAreaView></SafeAreaProvider>;
}
function Console({ defaults, record, onDisconnect }: { onDisconnect: () => void; defaults: LabDefaults; record: (label: string, value?: unknown) => void }) {
  const styles = useStyles();
  const client = useNuxie(), status = useNuxieStatus(), features = useFeatures();
  const [customer, setCustomer] = useState(defaults.customerId ?? 'sdk-lab-customer');
  const [feature, setFeature] = useState(defaults.featureId ?? 'premium_library');
  const [locale, setLocale] = useState('');
  const [event, setEvent] = useState(defaults.event ?? 'premium_library_requested');
  const [entity, setEntity] = useState(''), [operation, setOperation] = useState('');
  const [entityA, setEntityA] = useState(defaults.entityA ?? ''), [entityB, setEntityB] = useState(defaults.entityB ?? '');
  const [busy, setBusy] = useState(false);
  const selected = useFeature(feature);
  const started = useRef(false);
  useEffect(() => {
    if (!defaults.validateOnConnect || status.state !== 'configured' || started.current || !defaults.entityA || !defaults.entityB) return;
    started.current = true;
    void run('API checks', () => runChecks(client, { customerId: customer, featureId: feature,
      entityA: defaults.entityA!, entityB: defaults.entityB!, operationId: `rn-${Platform.OS}-${Date.now()}` }, record));
  }, [status.state, defaults, client, customer, feature]);
  const ready = status.state === 'configured' && !busy;
  async function run(label: string, action: () => Promise<unknown>) {
    setBusy(true);
    try { record(label, await action()); } catch (error) { record(`${label} failed`, error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  return <>
    <View style={styles.status}><View style={[styles.dot, status.state === 'configured' && styles.connected]} /><Text style={styles.statusLabel}>{status.state.toUpperCase()} / FEATURES {features.state.toUpperCase()}</Text></View>
    {status.state === 'failed' && <Text selectable style={styles.error}>{status.error.message}</Text>}
    {status.state === 'configured' && <Text style={styles.muted}>Wrapper {status.versions.wrapper} · Native {status.versions.native}</Text>}
    {(status.state === 'configured' || status.state === 'failed') && <Action label="Disconnect SDK" secondary disabled={busy} onPress={() => void run('Disconnected', async () => { await client.shutdown(); onDisconnect(); })} />}
    <Card title="01 / Customer" description="Identity changes fence off the previous customer's access.">
      <Field label="Customer ID" value={customer} onChangeText={setCustomer} />
      <Action label="Identify customer" disabled={!ready || !customer} onPress={() => void run('Identify', async () => { await client.identify(customer); return client.getDistinctId(); })} />
      <Action label="Reset to a new anonymous customer" secondary disabled={!ready} onPress={() => void run('Reset', async () => { await client.reset(); return client.getAnonymousId(); })} />
      <Action label="Read customer identity" secondary disabled={!ready} onPress={() => void run('Identity', async () => ({ distinctId: await client.getDistinctId(), anonymousId: await client.getAnonymousId(), isIdentified: await client.getIsIdentified() }))} />
      <Text style={styles.muted}>Locale changes apply at the next launch or foreground sync. Access waits for that sync.</Text>
      <Field label="Locale override (for example en_US)" value={locale} onChangeText={setLocale} />
      <Action label="Use locale override" secondary disabled={!ready || !locale.trim()} onPress={() => void run('Locale override', () => client.setLocaleIdentifier(locale.trim()))} />
      <Action label="Follow device locale" secondary disabled={!ready} onPress={() => void run('Device locale', () => client.setLocaleIdentifier(null))} />
    </Card>
    <Card title="02 / Feature access" description="The live selection is global. A scoped check is a separate authoritative query.">
      <Field label="Feature ID" value={feature} onChangeText={setFeature} />
      <View style={styles.access}><Text style={styles.accessTitle}>{selected.state === 'unknown' ? 'Waiting for authority' : selected.access?.allowed ? 'Access available' : 'No current access'}</Text><Text style={styles.muted}>{selected.access?.unlimited ? 'Unlimited' : `Balance ${selected.access?.balance ?? '—'}`}</Text></View>
      <Field label="Entity ID (optional)" value={entity} onChangeText={setEntity} />
      <Action label="Check with server" disabled={!ready || !feature} onPress={() => void run('Remote access', () => client.hasFeature(feature, { policy: 'remote', ...(entity ? { entityId: entity } : {}) }))} />
      <Field label="Operation ID for this spend" value={operation} onChangeText={setOperation} />
      <Text style={styles.muted}>Use the same operation ID when retrying. A new ID means a new spend.</Text>
      <Action label="Consume one unit" secondary disabled={!ready || !feature || !operation} onPress={() => void run('Consumption', () => client.consumeFeature(feature, { quantity: 1, operationId: operation, ...(entity ? { entityId: entity } : {}) }))} />
    </Card>
    <Card title="03 / Validate the backend" description="Use a metered Feature with separate positive grants for two entities. This checks identity, scope isolation, consumption, retry safety, and reset. Each run spends one unit from Entity A.">
      <Field label="Entity A" value={entityA} onChangeText={setEntityA} />
      <Field label="Entity B" value={entityB} onChangeText={setEntityB} />
      <Action label="Run API checks · spend one unit" disabled={!ready || !customer || !feature || !entityA || !entityB || entityA === entityB} onPress={() => void run('API checks', () => runChecks(client, { customerId: customer, featureId: feature, entityA, entityB, operationId: `rn-${Platform.OS}-${Date.now()}` }, record))} />
    </Card>
    <Card title="04 / Experiences" description="Trigger your authored event. Watch the native presentation and its activity above.">
      <Field label="Trigger event" value={event} onChangeText={setEvent} />
      <Action label="Trigger Experience" disabled={!ready || !event} onPress={() => void run('Trigger accepted', () => client.trigger(event, { source: 'react_native_sdk_lab' }))} />
      <Action label="Dismiss presented Experience" secondary disabled={!ready} onPress={() => void run('Dismiss', () => client.dismiss())} />
      <Action label="Restore purchases" secondary disabled={!ready} onPress={() => void run('Restore', () => client.restorePurchases())} />
    </Card>
  </>;
}
function Card({ title, description, children }: React.PropsWithChildren<{ title: string; description: string }>) { const styles = useStyles(); return <View style={styles.card}><Text style={styles.cardTitle}>{title}</Text><Text style={styles.description}>{description}</Text>{children}</View>; }
function Field({ label, ...props }: { label: string; value: string; onChangeText: (value: string) => void }) { const styles = useStyles(); return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} autoCapitalize="none" autoCorrect={false} style={styles.input} placeholderTextColor={styles.muted.color} {...props} /></View>; }
function Action({ label, disabled, secondary, onPress }: { label: string; disabled?: boolean; secondary?: boolean; onPress: () => void }) { const styles = useStyles(); return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, secondary && styles.secondary, (disabled || pressed) && styles.dim]}><Text style={[styles.buttonText, secondary && styles.secondaryText]}>{label}</Text></Pressable>; }
function createStyles(colors: typeof palette.light) { return StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { padding: 24, paddingBottom: 48, gap: 16 },
  eyebrow: { fontSize: 11, letterSpacing: 2, fontWeight: '700', color: colors.mutedForeground, marginTop: 16 },
  title: { fontSize: 40, lineHeight: 43, letterSpacing: -1.7, fontWeight: '700', color: colors.foreground },
  subtitle: { fontSize: 14, color: colors.mutedForeground, marginBottom: 10 },
  card: { padding: 20, backgroundColor: colors.card, borderRadius: 20, shadowColor: colors.shadow, shadowOpacity: 0.06, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, gap: 12 },
  cardTitle: { fontSize: 19, fontWeight: '600', letterSpacing: -0.4, color: colors.foreground },
  description: { fontSize: 13, lineHeight: 19, color: colors.mutedForeground, marginBottom: 4 },
  field: { gap: 6 }, label: { fontSize: 11, fontWeight: '600', color: colors.mutedForeground },
  input: { borderRadius: 10, padding: 12, color: colors.foreground, backgroundColor: colors.muted, fontSize: 14 },
  button: { padding: 14, backgroundColor: colors.primary, borderRadius: 99, alignItems: 'center' },
  buttonText: { color: colors.primaryForeground, fontSize: 13, fontWeight: '700' }, secondary: { backgroundColor: colors.secondary }, secondaryText: { color: colors.foreground }, dim: { opacity: 0.4 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8 }, dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.mutedForeground }, connected: { backgroundColor: colors.good }, statusLabel: { fontSize: 10, letterSpacing: 0.6, color: colors.mutedForeground, fontWeight: '600' },
  muted: { fontSize: 12, lineHeight: 18, color: colors.mutedForeground }, access: { padding: 14, backgroundColor: colors.secondary, borderRadius: 12, gap: 4 }, accessTitle: { fontSize: 15, fontWeight: '600', color: colors.foreground },
  log: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 10, lineHeight: 16, color: colors.mutedForeground }, error: { color: colors.bad, fontSize: 13 }, footer: { textAlign: 'center', fontSize: 11, color: colors.mutedForeground, marginTop: 4 },
}); }
const lightStyles = createStyles(palette.light), darkStyles = createStyles(palette.dark);
function useStyles() { return useColorScheme() === 'dark' ? darkStyles : lightStyles; }
