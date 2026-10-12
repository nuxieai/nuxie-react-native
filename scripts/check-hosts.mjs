import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { selectedPlatform } from './check.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

export function checkHosts(platform = 'all', runCommand = (command, args, cwd, env) => {
  console.log(`+ ${command} ${args.join(' ')} (${cwd})`);
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with status ${result.status}`);
}) {
  if (!['portable', 'android', 'ios', 'all'].includes(platform)) throw new Error('Select portable, android, ios or all');
  if (platform === 'portable') return;
  const ios = platform === 'ios' || platform === 'all';
  const android = platform === 'android' || platform === 'all';
  if (ios && process.platform !== 'darwin') throw new Error('iOS host readiness requires macOS');
  const env = {
    ...process.env,
    BUNDLE_GEMFILE: `${root}/examples/bare/Gemfile`,
    BUNDLE_PATH: `${root}/.build/gems`,
    BUNDLE_FROZEN: 'true',
    BUNDLE_IGNORE_CONFIG: 'true',
  };
  const run = (command, args, cwd = root) => runCommand(command, args, cwd, env);
  const workers = process.env.NUXIE_BAZEL_CPU || '2';
  if (ios && !/^[1-9][0-9]*$/.test(workers)) throw new Error('iOS workers must be a positive integer');
  const architecture = { arm64: 'arm64', x64: 'x86_64' }[process.arch];
  if (ios && !architecture) throw new Error('Unsupported iOS simulator host architecture');
  if (ios) run('bundle', ['install']);
  const pins = JSON.parse(readFileSync(`${root}/NATIVE-PINS.json`, 'utf8'));
  for (const [name, scheme] of [['bare', 'NuxieBare'], ['expo', 'NuxieExpoLab']]) {
    const cwd = `${root}/examples/${name}`;
    if (!existsSync(`${cwd}/node_modules`)) throw new Error(`Install dependencies in examples/${name} first.`);
    const installed = JSON.parse(readFileSync(`${cwd}/node_modules/@nuxie/react-native/NATIVE-PINS.json`, 'utf8'));
    for (const sdk of [ios && 'ios', android && 'android'].filter(Boolean)) {
      if (pins[sdk].revision !== installed[sdk].revision) throw new Error(`${name} has stale ${sdk} native pins`);
    }
    if (name === 'expo') {
      run('pnpm', ['--ignore-workspace', 'exec', 'expo', 'prebuild', '--no-install', ...(platform === 'all' ? [] : ['--platform', platform])], cwd);
    }
    if (ios) {
      run('bundle', ['exec', 'pod', 'install'], `${cwd}/ios`);
      run('xcodebuild', ['-jobs', workers, '-workspace', `${scheme}.xcworkspace`, '-scheme', scheme,
        '-configuration', 'Debug', '-sdk', 'iphonesimulator', '-destination', 'generic/platform=iOS Simulator',
        `ARCHS=${architecture}`, '-derivedDataPath', `../../.build/${name}-ios`, 'CODE_SIGNING_ALLOWED=NO', 'build'], `${cwd}/ios`);
    }
    if (android) run('./gradlew', ['--no-daemon', `--max-workers=${process.env.NUXIE_CI_RUNNER_POLICY_VERSION === '2' ? '1' : '2'}`, ':app:assembleDebug'], `${cwd}/android`);
  }
}

if (process.argv[1] && process.argv[1] !== '-' && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkHosts(selectedPlatform(process.argv.slice(2)));
}
