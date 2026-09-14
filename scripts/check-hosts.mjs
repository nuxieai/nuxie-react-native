import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
function run(command, args, cwd) {
  console.log(`> ${command} ${args.join(' ')}`);
  const child = spawnSync(command, args, { cwd, stdio: 'inherit', env: process.env });
  if (child.error) throw child.error;
  if (child.status !== 0) process.exit(child.status ?? 1);
}
for (const [host, scheme] of [['bare', 'NuxieBare'], ['expo', 'NuxieExpoLab']]) {
  const app = `${root}/examples/${host}`;
  if (!existsSync(`${app}/node_modules`)) throw new Error(`Install dependencies in examples/${host} first`);
  if (host === 'expo') run('pnpm', ['--ignore-workspace', 'exec', 'expo', 'prebuild', '--no-install'], app);
  run('pod', ['install'], `${app}/ios`);
  run('xcodebuild', ['-workspace', `${scheme}.xcworkspace`, '-scheme', scheme, '-configuration', 'Debug',
    '-sdk', 'iphonesimulator', '-destination', 'generic/platform=iOS Simulator', '-derivedDataPath', `../../.build/${host}-ios`,
    'ARCHS=arm64', 'CODE_SIGNING_ALLOWED=NO', 'build'], `${app}/ios`);
  run('./gradlew', [':app:assembleDebug'], `${app}/android`);
}
