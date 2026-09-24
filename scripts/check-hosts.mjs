import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const env = {
  ...process.env,
  BUNDLE_GEMFILE: `${root}/examples/bare/Gemfile`,
  BUNDLE_PATH: `${root}/.build/gems`,
  BUNDLE_FROZEN: 'true',
  BUNDLE_IGNORE_CONFIG: 'true',
};
function run(command, args, cwd) {
  console.log(`> ${command} ${args.join(' ')}`);
  const child = spawnSync(command, args, { cwd, stdio: 'inherit', env });
  if (child.error) throw child.error;
  if (child.status !== 0) process.exit(child.status ?? 1);
}
run('bundle', ['install'], root);
for (const [host, scheme] of [['bare', 'NuxieBare'], ['expo', 'NuxieExpoLab']]) {
  const app = `${root}/examples/${host}`;
  if (!existsSync(`${app}/node_modules`)) throw new Error(`Install dependencies in examples/${host} first`);
  const expectedPins = JSON.parse(readFileSync(`${root}/NATIVE-PINS.json`, 'utf8'));
  const installedPins = JSON.parse(readFileSync(`${app}/node_modules/@nuxie/react-native/NATIVE-PINS.json`, 'utf8'));
  for (const platform of ['ios', 'android']) {
    if (installedPins[platform].revision !== expectedPins[platform].revision) {
      throw new Error(`Stale ${platform} SDK pin in examples/${host}; reinstall its file dependency before qualification`);
    }
  }
  if (host === 'expo') run('pnpm', ['--ignore-workspace', 'exec', 'expo', 'prebuild', '--no-install'], app);
  run('bundle', ['exec', 'pod', 'install'], `${app}/ios`);
  run('xcodebuild', ['-workspace', `${scheme}.xcworkspace`, '-scheme', scheme, '-configuration', 'Debug',
    '-sdk', 'iphonesimulator', '-destination', 'generic/platform=iOS Simulator', '-derivedDataPath', `../../.build/${host}-ios`,
    'ARCHS=arm64', 'CODE_SIGNING_ALLOWED=NO', 'build'], `${app}/ios`);
  run('./gradlew', [':app:assembleDebug'], `${app}/android`);
}
