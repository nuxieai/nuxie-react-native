import { spawnSync } from 'node:child_process';
for (const task of ['lint', 'typecheck', 'typecheck:examples', 'test', 'build', 'check:package']) {
  const result = spawnSync('pnpm', ['--ignore-workspace', 'run', task], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const hosts = spawnSync('node', ['scripts/check-hosts.mjs'], { stdio: 'inherit' });
process.exit(hosts.status ?? 1);
