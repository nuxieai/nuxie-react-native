import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sdkRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const options = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const name = process.argv[index], value = process.argv[index + 1];
  if (!['--native-ios-checkout', '--output'].includes(name) || !value || options.has(name)) {
    throw new Error('Use --native-ios-checkout /absolute/checkout --output /absolute/new-fixture-directory');
  }
  options.set(name, resolve(value));
}
if (options.size !== 2) throw new Error('Select a clean native iOS checkout and a new output directory');
const sourceRoot = options.get('--native-ios-checkout');
const outputRoot = options.get('--output');
const pins = JSON.parse(await readFile(join(sdkRoot, 'NATIVE-PINS.json'), 'utf8'));
const git = (...args) => execFileSync('git', args, { cwd: sourceRoot, encoding: 'utf8' }).trim();
if (git('rev-parse', 'HEAD') !== pins.ios.revision || git('status', '--porcelain')) {
  throw new Error('Fixture source must be clean at the canonical native iOS pin');
}
const relativeSource = 'fixtures/journeys/planes/release.json';
git('ls-files', '--error-unmatch', relativeSource);
const sourceBytes = await readFile(join(sourceRoot, relativeSource));
const trackedBytes = execFileSync('git', ['show', 'HEAD:' + relativeSource], { cwd: sourceRoot });
if (!sourceBytes.equals(trackedBytes)) throw new Error('Fixture source bytes differ from the pinned Git object');
const golden = JSON.parse(sourceBytes);
const descriptor = JSON.parse(Buffer.from(golden.entry.envelope.descriptorBytesBase64, 'base64'));
// This published native fixture key is deliberately test-only and is trusted only by development hosts.
const key = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.alloc(32, 0x42)]), format: 'der', type: 'pkcs8' });
const publicKey = createPublicKey(key);
if (publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64') !== golden.publicKeyBase64) {
  throw new Error('Pinned native fixture public key differs from the test signing key');
}
const sha = data => createHash('sha256').update(data).digest('hex');
const canonical = value => value === null || typeof value !== 'object' ? JSON.stringify(value) : Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']' : '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';

descriptor.identity = { appId: 'app_wrapper_v3', buildId: 'build_wrapper_v3', environment: 'test', experienceId: 'experience_wrapper_v3', experienceVersionId: 'version_wrapper_v3', publishedAt: '2026-10-11T12:00:00.000Z', publishedAtSeq: 4288, versionNumber: 3 };
descriptor.leg.entryCondition = { type: 'event', eventName: 'wrapper_v3_probe' };
descriptor.leg.policy.entry.trigger = { type: 'event', eventName: 'wrapper_v3_probe' };
const fields = [{ key: 'probeNumber', type: 'number', required: true }, { key: 'probeText', type: 'string', required: true }, { key: 'probeBoolean', type: 'boolean', required: true }];
descriptor.leg.inputs = { eventFields: fields, responseFields: [] };
descriptor.leg.completionOutputs = { continue: { eventFields: fields, responseFields: [] } };
descriptor.metadata.name = 'Downstream native v3 admission and typed event values';
descriptor.metadata.description = 'Screenless native Journey fixture for actual downstream adapter consumers';

const cases = [
  { name: 'accepted', schema: 'nuxie.journey-release.v3', signatureDomain: 'nuxie.journey-release.v3\\0', verdict: 'accepted', reason: null },
  { name: 'retired-v1', schema: 'nuxie.journey-release.v1', signatureDomain: 'nuxie.journey-release.v3\\0', verdict: 'rejected', reason: 'journey_release.descriptor.invalid' },
  { name: 'retired-v2', schema: 'nuxie.journey-release.v2', signatureDomain: 'nuxie.journey-release.v3\\0', verdict: 'rejected', reason: 'journey_release.descriptor.invalid' },
  { name: 'wrong-domain', schema: 'nuxie.journey-release.v3', signatureDomain: 'nuxie.journey-release.v2\\0', verdict: 'rejected', reason: 'journey_release.signature.bad_signature' },
];
const manifest = { nativeIOSRevision: pins.ios.revision, nativeAndroidRevision: pins.android.revision, source: relativeSource, sourceRepository: pins.ios.repository, sourceSha256: sha(sourceBytes), publicKeyBase64: golden.publicKeyBase64, trigger: 'wrapper_v3_probe', triggerProperties: { probeNumber: 42, probeText: 'native-v3-wrapper', probeBoolean: true }, authorityHeaders: { 'Nuxie-App-Id': descriptor.identity.appId, 'Nuxie-App-Environment': 'test' }, expectedActivities: ['journey_started', 'journey_completed'], expectedProperties: { experience_id: descriptor.identity.experienceId, experience_version: descriptor.identity.experienceVersionId, leg_id: descriptor.leg.id, leg_generation: 0, outcome: 'continue' }, expectedOutputs: { event: { probeNumber: 42, probeText: 'native-v3-wrapper', probeBoolean: true }, responses: {} }, cases: [] };
await mkdir(outputRoot);
for (const item of cases) {
  const changed = structuredClone(descriptor); changed.schemaVersion = item.schema;
  const bytes = Buffer.from(canonical(changed));
  const domain = item.signatureDomain.replace('\\0', '\0');
  const signature = sign(null, Buffer.concat([Buffer.from(domain), bytes]), key);
  const digest = sha(bytes);
  const entry = { locator: { ...descriptor.identity, legId: descriptor.leg.id }, envelope: { mediaType: 'application/vnd.nuxie.journey+json', encoding: 'base64', descriptorSha256: digest, descriptorSizeBytes: bytes.length, descriptorBytesBase64: bytes.toString('base64'), signature: { version: 1, algorithm: 'ed25519', keyId: 'TEST_ONLY_DEV_KEYPAIR', signatureBase64: signature.toString('base64') } } };
  const profile = { schemaVersion: 'nuxie.journey-plane-profile.v2', status: 'ok', delivery: { renderBaseUrl: 'https://wrapper-v3.nuxie.test/', assetBaseUrl: 'https://wrapper-v3.nuxie.test/' }, features: [], facts: { properties: {}, memberships: {}, assignments: {} }, releases: [entry], armedLegs: [{ reference: { experienceId: descriptor.identity.experienceId, versionId: descriptor.identity.experienceVersionId, legId: descriptor.leg.id, descriptorSha256: digest }, binding: { type: 'new' }, entryCondition: descriptor.leg.entryCondition, context: { event: {}, responses: {} } }] };
  const output = Buffer.from(JSON.stringify(profile, null, 2) + '\n');
  await writeFile(join(outputRoot, item.name + '.json'), output);
  manifest.cases.push({ ...item, signatureDomain: domain, file: item.name + '.json', sha256: sha(output), descriptorSha256: digest, validUnderDeclaredDomain: verify(null, Buffer.concat([Buffer.from(domain), bytes]), publicKey, signature), validUnderV3Domain: verify(null, Buffer.concat([Buffer.from('nuxie.journey-release.v3\0'), bytes]), publicKey, signature) });
}
await writeFile(join(outputRoot, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest.cases.map(item => ({ name: item.name, sha256: item.sha256, validUnderV3Domain: item.validUnderV3Domain }))));
