"""Exercise native selection without downloading or compiling any SDK."""
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

import sdk


class PlatformSelectionTests(unittest.TestCase):
    def setUp(self):
        guard = patch.object(sdk, 'pool_dispatch', return_value=None)
        guard.start(); self.addCleanup(guard.stop)

    def invoke(self, selected, host='linux'):
        products = {'android': Path('/synthetic/android/sdk-artifacts.json'), 'ios': Path('/synthetic/ios/sdk-artifacts.json')}
        with patch.object(sys, 'argv', ['sdk.py', 'build-native', '--platform', selected]), \
                patch.object(sys, 'platform', host), patch.object(sdk.platform, 'machine', return_value='arm64'), \
                patch.object(sdk, 'prepare', side_effect=lambda root, platforms, **kwargs: {name: products[name] for name in platforms}) as prepare, \
                patch.object(sdk.subprocess, 'run') as commands, patch.object(sdk, 'sdk_view', return_value=Path('/synthetic/android-sdk')):
            sdk.main()
            return prepare.call_args_list, commands.call_args_list

    def test_portable_has_no_native_prepare_or_command(self):
        prepared, commands = self.invoke('portable')
        self.assertEqual(prepared, [])
        self.assertEqual(commands, [])

    def test_android_on_linux_prepares_only_android_and_compiles_its_bridge(self):
        prepared, commands = self.invoke('android')
        self.assertEqual(len(prepared), 1)
        self.assertEqual(prepared[0].args[1], ['android'])
        self.assertEqual(len(commands), 1)
        argv = commands[0].args[0]
        self.assertIn('//android:bridge', argv)
        self.assertIn('--platforms=//:android_arm64', argv)
        self.assertNotIn('NUXIE_IOS_ARTIFACTS', commands[0].kwargs['env'])

    def test_ios_has_no_android_prepare_toolchain_or_bridge(self):
        prepared, commands = self.invoke('ios', 'darwin')
        self.assertEqual(prepared[0].args[1], ['ios'])
        self.assertEqual(len(commands), 1)
        self.assertIn('//ios:swift_bridge', commands[0].args[0])
        self.assertEqual(commands[0].kwargs['env']['ANDROID_HOME'], '')
        self.assertNotIn('NUXIE_ANDROID_ARTIFACTS', commands[0].kwargs['env'])

    def test_opposite_platform_fails_before_preparation(self):
        with patch.object(sys, 'argv', ['sdk.py', 'build-native', '--platform', 'ios']), \
                patch.object(sys, 'platform', 'linux'), patch.object(sdk, 'prepare') as prepare:
            with self.assertRaisesRegex(ValueError, 'requires macOS'):
                sdk.main()
        prepare.assert_not_called()

    def test_default_all_preserves_both_bridges(self):
        with patch.object(sys, 'argv', ['sdk.py', 'build-native']), patch.object(sys, 'platform', 'darwin'), \
                patch.object(sdk.platform, 'machine', return_value='arm64'), \
                patch.object(sdk, 'prepare', return_value={'ios': Path('/synthetic/ios'), 'android': Path('/synthetic/android')}) as prepare, \
                patch.object(sdk.subprocess, 'run') as commands, patch.object(sdk, 'sdk_view', return_value=Path('/synthetic/android-sdk')):
            sdk.main()
        self.assertEqual(prepare.call_args.args[1], ['ios', 'android'])
        self.assertEqual([entry.args[0][2] for entry in commands.call_args_list], ['//ios:swift_bridge', '//android:bridge'])


if __name__ == '__main__':
    unittest.main()
