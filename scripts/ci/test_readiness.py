"""Execute the real JS readiness entrypoints with isolated command recorders."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


class ReadinessTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        (self.root / 'scripts').mkdir()
        for name in ['check.mjs', 'check-hosts.mjs']:
            shutil.copy2(ROOT / 'scripts' / name, self.root / 'scripts' / name)
        self.pins = {'ios': {'revision': 'a' * 40}, 'android': {'revision': 'b' * 40}}
        (self.root / 'NATIVE-PINS.json').write_text(json.dumps(self.pins))
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        self.log = self.root / 'commands.jsonl'
        script = '#!' + sys.executable + '\n' + '''import json, os, sys
from pathlib import Path
with open(os.environ['COMMAND_LOG'], 'a') as output:
    output.write(json.dumps({'command': Path(sys.argv[0]).name, 'args': sys.argv[1:], 'cwd': os.getcwd()}) + '\\n')
'''
        for command in ['pnpm', 'bundle', 'xcodebuild']:
            path = self.bin / command
            path.write_text(script)
            path.chmod(0o755)
        for host in ['bare', 'expo']:
            path = self.root / 'examples' / host
            installed = path / 'node_modules/@nuxie/react-native'
            installed.mkdir(parents=True)
            (installed / 'NATIVE-PINS.json').write_text(json.dumps(self.pins))
            (path / 'ios').mkdir()
            (path / 'android').mkdir()
            gradle = path / 'android/gradlew'
            gradle.write_text(script)
            gradle.chmod(0o755)
        self.environment = dict(os.environ, NUXIE_CI_RUNNER_POLICY_VERSION='1', PATH=str(self.bin) + os.pathsep + os.environ['PATH'], COMMAND_LOG=str(self.log))

    def check(self, selected=None, hosts=False):
        args = [shutil.which('node'), str(self.root / 'scripts' / ('check-hosts.mjs' if hosts else 'check.mjs'))]
        if selected is not None:
            args += ['--platform', selected]
        result = subprocess.run(args, cwd=self.root, env=self.environment, text=True, capture_output=True, timeout=30)
        commands = [json.loads(line) for line in self.log.read_text().splitlines()] if self.log.exists() else []
        return result, commands

    def test_portable_cli_never_calls_native_package_or_hosts(self):
        result, commands = self.check('portable')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual([entry['args'][-1] for entry in commands], ['lint', 'typecheck', 'typecheck:examples', 'test', 'build'])
        self.assertTrue(all(entry['command'] == 'pnpm' for entry in commands))

    def test_android_cli_preserves_package_and_both_consumers_without_apple(self):
        result, commands = self.check('android')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual([entry['command'] for entry in commands].count('gradlew'), 2)
        self.assertFalse(any(entry['command'] in ['bundle', 'xcodebuild'] for entry in commands))
        self.assertTrue(any(entry['args'] == ['--ignore-workspace', 'run', 'build:native', '--platform', 'android'] for entry in commands))
        self.assertTrue(any(entry['args'][-1] == 'check:package' for entry in commands))
        self.assertTrue(any(entry['args'] == ['--ignore-workspace', 'exec', 'expo', 'prebuild', '--no-install', '--platform', 'android'] for entry in commands))
        self.assertTrue(all('--max-workers=2' in entry['args'] for entry in commands if entry['command'] == 'gradlew'))

    def test_v2_android_honors_installed_single_gradle_worker(self):
        self.environment['NUXIE_CI_RUNNER_POLICY_VERSION'] = '2'
        result, commands = self.check('android')
        self.assertEqual(result.returncode, 0, result.stderr)
        gradle = [item for item in commands if item['command'] == 'gradlew']
        self.assertTrue(gradle)
        self.assertTrue(all('--max-workers=1' in item['args'] for item in gradle))

    @unittest.skipUnless(sys.platform == 'darwin', 'iOS execution fixture requires macOS; opposite-platform refusal covered separately')
    def test_ios_cli_ignores_opposite_pin_and_never_calls_android(self):
        for host in ['bare', 'expo']:
            pins = dict(self.pins, android={'revision': 'wrong-opposite-platform'})
            (self.root / 'examples' / host / 'node_modules/@nuxie/react-native/NATIVE-PINS.json').write_text(json.dumps(pins))
        result, commands = self.check('ios')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual([entry['command'] for entry in commands].count('xcodebuild'), 2)
        self.assertEqual([entry['command'] for entry in commands].count('bundle'), 3)
        self.assertFalse(any(entry['command'] == 'gradlew' or 'check:package' in entry['args'] for entry in commands))
        self.assertTrue(any(entry['args'] == ['--ignore-workspace', 'exec', 'expo', 'prebuild', '--no-install', '--platform', 'ios'] for entry in commands))

    @unittest.skipUnless(sys.platform == 'darwin', 'full readiness requires macOS')
    def test_default_full_readiness_preserves_package_and_all_four_hosts(self):
        result, commands = self.check()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual([entry['command'] for entry in commands].count('xcodebuild'), 2)
        self.assertEqual([entry['command'] for entry in commands].count('gradlew'), 2)
        self.assertTrue(any(entry['args'][-1] == 'check:package' for entry in commands))
        self.assertTrue(any(entry['args'] == ['--ignore-workspace', 'run', 'build:native', '--platform', 'all'] for entry in commands))

    def test_wrong_selected_host_pin_and_invalid_selector_fail(self):
        (self.root / 'examples/bare/node_modules/@nuxie/react-native/NATIVE-PINS.json').write_text(json.dumps(dict(self.pins, android={'revision': 'wrong'})))
        result, commands = self.check('android', hosts=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(commands, [])
        result, _ = self.check('unknown')
        self.assertNotEqual(result.returncode, 0)


if __name__ == '__main__':
    unittest.main()
