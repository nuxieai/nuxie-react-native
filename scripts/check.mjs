import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function selectedPlatform(args) {
  if (args.length === 0) return 'all';
  if (args.length !== 2 || args[0] !== '--platform' || !['portable', 'android', 'ios', 'all'].includes(args[1])) {
    throw new Error('Use --platform portable|android|ios|all');
  }
  return args[1];
}

export function check(platform = 'all', run = (command, args) => {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with status ${result.status}`);
}) {
  if (!['portable', 'android', 'ios', 'all'].includes(platform)) throw new Error('Select portable, android, ios or all');
  for (const task of ['lint', 'typecheck', 'typecheck:examples', 'test', 'build']) {
    run('pnpm', ['--ignore-workspace', 'run', task]);
  }
  if (platform === 'portable') return;
  run('pnpm', ['--ignore-workspace', 'run', 'build:native', '--platform', platform]);
  // The npm artifact includes the Android Maven repository. Keep its actual
  // packed-file, ELF, plugin and server-import oracle with that producer.
  if (platform === 'android' || platform === 'all') {
    run('pnpm', ['--ignore-workspace', 'run', 'check:package']);
  }
  run('node', ['scripts/check-hosts.mjs', '--platform', platform]);
}

if (process.argv[1] && process.argv[1] !== '-' && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const platform = selectedPlatform(process.argv.slice(2));
  const result = process.env._NUXIE_POOL_NESTED === '1' ? null : spawnSync('python3', ['scripts/pool.py', 'check', '--platform', platform], { stdio: 'inherit' });
  if (process.env._NUXIE_POOL_NESTED === '1') check(platform);
  else {
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  }
}
