import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';

const manifest = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const sourceRoot = process.cwd();
const scratch = mkdtempSync(resolve(process.env.TEST_TMPDIR ?? tmpdir(), 'nuxie-js-'));
const output = manifest.output && resolve(manifest.output);
const tools = Object.fromEntries(['node', 'bun', 'tsc'].map(name => [name, resolve(manifest[name])]));
function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: scratch, stdio: 'inherit',
    env: { ...process.env, HOME: scratch, BUN_TELEMETRY_DISABLE: '1' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited ${result.status ?? 1}`);
}
try {
  for (const [relative, input] of Object.entries(manifest.sources)) {
    const destination = resolve(scratch, relative);
    if (!destination.startsWith(scratch + '/')) throw new Error(`Source escapes workspace: ${relative}`);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(resolve(sourceRoot, input), destination);
  }
  const modules = dirname(dirname(dirname(tools.tsc)));
  symlinkSync(modules, resolve(scratch, 'node_modules'), 'dir');
  mkdirSync(resolve(scratch, 'dist'), { recursive: true });
  if (manifest.mode === 'bundle') {
    run(tools.bun, ['build', './src/index.ts', '--outdir', 'dist', '--splitting', '--format', 'esm', '--external', 'react', '--external', 'react-native']);
  } else if (manifest.mode === 'declarations') {
    run(tools.node, [tools.tsc, '-p', 'tsconfig.build.json', '--emitDeclarationOnly']);
  } else if (manifest.mode === 'typecheck') {
    run(tools.node, [tools.tsc, '--noEmit']);
    writeFileSync(resolve(scratch, 'dist/typecheck.ok'), 'TypeScript source checked.\n');
  } else if (manifest.mode === 'test') {
    const tests = Object.keys(manifest.sources).filter(name => /^tests\/.*\.test\.tsx?$/.test(name)).sort();
    if (!tests.length) throw new Error('No SDK unit tests declared');
    run(tools.bun, ['test', ...tests.map(name => './' + name)]);
  } else {
    throw new Error(`Unknown compiler mode: ${manifest.mode}`);
  }
  if (output) {
    mkdirSync(output, { recursive: true });
    cpSync(resolve(scratch, 'dist'), output, { recursive: true });
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
