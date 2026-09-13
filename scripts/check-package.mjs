import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const root = new URL('../', import.meta.url);
const packageJson = JSON.parse(readFileSync(new URL('package.json', root)));
const pins = JSON.parse(readFileSync(new URL('NATIVE-PINS.json', root)));
const version = `0.2.0-${pins.android.revision}`;
const artifact = `android/maven/ai/nuxie/nuxie-android/${version}/nuxie-android-${version}.aar`;
const bytes = readFileSync(new URL(artifact, root));
const expected = readFileSync(new URL(`${artifact}.sha256`, root), 'utf8').trim();
assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, 'Native artifact digest differs');
const archiveFiles = execFileSync('unzip', ['-Z1', new URL(artifact, root).pathname], { encoding: 'utf8' }).split('\n');
for (const abi of ['arm64-v8a', 'x86_64']) assert(archiveFiles.some(path => path.startsWith(`jni/${abi}/`) && path.endsWith('.so')), `Missing ${abi}`);
for (const library of archiveFiles.filter(path => /^jni\/(arm64-v8a|x86_64)\/.*\.so$/.test(path))) {
  const elf = execFileSync('unzip', ['-p', new URL(artifact, root).pathname, library], { maxBuffer: 64 * 1024 * 1024 });
  assert.equal(elf.subarray(0, 4).toString('hex'), '7f454c46', `${library}: expected ELF`);
  assert.equal(elf[4], 2, `${library}: expected 64-bit library`);
  assert.equal(elf[5], 1, `${library}: expected little-endian Android ELF`);
  const offset = Number(elf.readBigUInt64LE(32)), size = elf.readUInt16LE(54), count = elf.readUInt16LE(56);
  for (let index = 0; index < count; index++) {
    const header = offset + index * size;
    if (elf.readUInt32LE(header) === 1) assert(elf.readBigUInt64LE(header + 48) >= 16384n, `${library}: load segment is not aligned for 16 KiB pages`);
  }
}
assert(!packageJson.peerDependencies.expo && !packageJson.dependencies?.expo);
const plugin = createRequire(import.meta.url)('../app.plugin.cjs');
const config = { name: 'Consumer app', slug: 'consumer' };
assert.equal(plugin(config), config);
assert.equal(plugin(plugin(config)), config);
assert.throws(() => plugin(config, { apiKey: 'old-configuration' }));
const packed = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: root, encoding: 'utf8' }))[0];
const names = new Set(packed.files.map(file => file.path));
for (const path of [artifact, 'NATIVE-PINS.json', 'NuxieReactNative.podspec', 'react-native.config.cjs', 'src/specs/NativeNuxie.ts', 'dist/index.js', 'dist/index.d.ts']) assert(names.has(path), `Missing packed file: ${path}`);
assert(!names.has('expo-module.config.json'));
assert(![...names].some(path => path.startsWith('examples/') || path.startsWith('.native/')));
for (const file of readdirSync(new URL('dist/', root))) if (file.endsWith('.js')) assert(names.has(`dist/${file}`));
const api = await import('../dist/index.js');
assert.equal(api.nuxie.getStatus().state, 'unconfigured');
assert.deepEqual(Object.keys(api).sort(), ['NuxieError', 'NuxieProvider', 'nuxie', 'useFeature', 'useFeatures', 'useNuxie', 'useNuxieActivity', 'useNuxieAppAction', 'useNuxieStatus'].sort());
console.log(`Package exports, server import, plugin, native digest/16 KiB alignment and ${packed.files.length} packed files verified.`);
