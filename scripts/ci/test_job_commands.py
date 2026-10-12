"""Execute native job ordering independently of their preparation/check helpers."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('recorded_jobs', ROOT / 'scripts/ci/pipeline.py')
renderer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)


class JobCommandTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        (self.root / 'scripts/bazel').mkdir(parents=True)
        (self.root / 'scripts/bazel/ci-cache.sh').write_text(':\n')
        for host in ('bare', 'expo'):
            (self.root / 'examples' / host).mkdir(parents=True)
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        self.log = self.root / 'commands.jsonl'
        program = '#!' + sys.executable + '\n' + '''import json,os,sys
from pathlib import Path
with open(os.environ['COMMAND_LOG'], 'a') as output:
    output.write(json.dumps({'command': Path(sys.argv[0]).name, 'args': sys.argv[1:], 'cwd': os.getcwd(),
                             'preparedOnly': os.environ.get('NUXIE_NATIVE_PREPARED_ONLY'),
                             'developerDir': os.environ.get('DEVELOPER_DIR')}) + '\\n')
if sys.argv[1:2] == ['scripts/check.mjs']: sys.exit(int(os.environ.get('CHECK_STATUS', '0')))
'''
        for name in ('python3', 'corepack', 'node'):
            path = self.bin / name
            path.write_text(program)
            path.chmod(0o755)

    def run_lane(self, selected, **extra):
        self.log.unlink(missing_ok=True)
        lane = next(lane for lane in renderer.pipeline({'NUXIE_CI_RUNNER_POLICY_VERSION': '2', 'NUXIE_SDK_SPLIT_LANES': '1'})['steps'] if lane['key'] == selected)
        env = dict(os.environ, **lane['env'], HOME=str(self.root / 'home'), JAVA_HOME=str(self.root / 'java'),
                   ANDROID_HOME=str(self.root / 'android-sdk'), PATH=str(self.bin) + os.pathsep + os.environ['PATH'],
                   COMMAND_LOG=str(self.log), **extra)
        result = subprocess.run(['bash', '-c', lane['command']], cwd=self.root, env=env, text=True, capture_output=True, timeout=20)
        commands = [json.loads(line) for line in self.log.read_text().splitlines()]
        return result, commands

    def test_selected_producer_precedes_both_file_installs_and_verify_only_bridge_checks(self):
        for selected in ('portable', 'android', 'ios'):
            with self.subTest(selected=selected):
                result, commands = self.run_lane(selected)
                self.assertEqual(result.returncode, 0, result.stderr)
                prepared = [item for item in commands if item['args'][:1] == ['scripts/prepare-native.py']]
                checked = next(item for item in commands if item['args'][:1] == ['scripts/check.mjs'])
                self.assertEqual(checked['args'], ['scripts/check.mjs', '--platform', selected])
                self.assertEqual(commands[-1]['args'], ['scripts/ci/record-lane.py', '--platform', selected])
                if selected == 'portable':
                    self.assertEqual(prepared, [])
                    self.assertFalse(any('/examples/' in item['cwd'] for item in commands))
                    continue
                self.assertEqual([item['args'] for item in prepared], [['scripts/prepare-native.py', '--platform', selected]])
                self.assertEqual(checked['preparedOnly'], '1')
                installs = [item for item in commands if '/examples/' in item['cwd']]
                self.assertEqual(len(installs), 2)
                self.assertTrue(all(commands.index(prepared[0]) < commands.index(item) < commands.index(checked) for item in installs))
                build = next(item for item in commands if item['args'] == ['pnpm', '--ignore-workspace', 'run', 'build'])
                self.assertLess(commands.index(prepared[0]), commands.index(build))
                if selected == 'ios':
                    self.assertEqual(checked['developerDir'], str(self.root / 'home/Applications/Xcode-26.6.app/Contents/Developer'))

    def test_v2_unsplit_prepares_both_once_before_distribution_and_reuses_exact_products(self):
        lane = renderer.pipeline({'NUXIE_CI_RUNNER_POLICY_VERSION': '2', 'NUXIE_SDK_SPLIT_LANES': '0'})['steps'][0]
        commands = [line for line in lane['command'].splitlines() if line.startswith(('python3 scripts/prepare-native.py',
                    'export NUXIE_NATIVE_PREPARED_ONLY=', 'corepack ', '(cd examples/', 'node scripts/check.mjs'))]
        result = subprocess.run(['bash', '-c', 'set -euo pipefail\n' + '\n'.join(commands)], cwd=self.root,
            env=dict(os.environ, **lane['env'], COMMAND_LOG=str(self.log), PATH=str(self.bin) + os.pathsep + os.environ['PATH']),
            text=True, capture_output=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr)
        actual = [json.loads(line) for line in self.log.read_text().splitlines()]
        prepared = [item for item in actual if item['args'][:1] == ['scripts/prepare-native.py']]
        self.assertEqual([item['args'] for item in prepared], [['scripts/prepare-native.py', '--platform', 'all']])
        checked = next(item for item in actual if item['args'] == ['scripts/check.mjs'])
        self.assertEqual(checked['preparedOnly'], '1')
        self.assertTrue(all(actual.index(prepared[0]) < actual.index(item) for item in actual if '/examples/' in item['cwd']))

    def test_legacy_native_preparation_selects_java21_over_ambient_java17(self):
        lane = renderer.pipeline({})['steps'][0]
        selection = [line for line in lane['command'].splitlines() if line.startswith('export JAVA_HOME=')]
        self.assertEqual(len(selection), 1)
        result = subprocess.run(['bash', '-c', 'set -euo pipefail\n' + selection[0] + '\nprintf "%s" "$JAVA_HOME"'],
            env=dict(os.environ, JAVA_HOME='/synthetic/ambient/java17'), text=True, capture_output=True, timeout=5)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home')

    def test_failed_selected_check_never_publishes_successful_readiness_record(self):
        result, commands = self.run_lane('android', CHECK_STATUS='17')
        self.assertEqual(result.returncode, 17)
        self.assertFalse(any(item['args'][:1] == ['scripts/ci/record-lane.py'] for item in commands))


if __name__ == '__main__':
    unittest.main()
