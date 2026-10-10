#!/usr/bin/env python3
"""Publish direct Bazel compiler outputs into this checkout's npm package."""
import argparse
import fcntl
import platform
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from native_prepare import prepare
from android_sdk import sdk_view

ROOT = Path(__file__).resolve().parents[2]
LAUNCHER = ROOT / 'scripts/bazel/bazel.sh'


def non_android_environment():
    # rules_android registers SDK toolchains transitively. Its empty SDK
    # repository lets JS and Apple targets run without an Android installation.
    return dict(os.environ, ANDROID_HOME='', ANDROID_SDK_ROOT='')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['build', 'test', 'typecheck', 'build-native'])
    args = parser.parse_args()
    if args.command == 'build-native':
        products = prepare(ROOT, ['ios', 'android'], android_output=ROOT / 'android/maven')
        environment = dict(non_android_environment(), NUXIE_IOS_ARTIFACTS=str(products['ios']),
                           NUXIE_ANDROID_ARTIFACTS=str(products['android']))
        architecture = platform.machine()
        subprocess.run([str(LAUNCHER), 'build', '//ios:swift_bridge',
                        '--platforms=//:ios_simulator_' + architecture, '--ios_minimum_os=15.1'], cwd=ROOT, env=environment, check=True)
        view = sdk_view(ROOT)
        environment.update(ANDROID_HOME=str(view), ANDROID_SDK_ROOT=str(view))
        subprocess.run([str(LAUNCHER), 'build', '//android:bridge', '--platforms=//:android_arm64', '--extra_toolchains=@androidsdk//:sdk-toolchain'], cwd=ROOT, env=environment, check=True)
        return
    if args.command == 'test':
        subprocess.run([str(LAUNCHER), 'test', '//:unit_tests'], cwd=ROOT, env=non_android_environment(), check=True)
        return
    label = '//:sdk' if args.command == 'build' else '//:typecheck'
    subprocess.run([str(LAUNCHER), 'build', label], cwd=ROOT, env=non_android_environment(), check=True)
    if args.command != 'build':
        return
    outputs = subprocess.check_output([str(LAUNCHER), 'cquery', label, '--output=files'], cwd=ROOT, env=non_android_environment(), text=True).splitlines()
    if len(outputs) != 1:
        raise ValueError('Expected one Bazel npm distribution directory')
    product = Path(outputs[0])
    if not product.is_absolute():
        product = ROOT / product
    publish_distribution(product, ROOT)

def publish_distribution(product, root):
    scratch = root / '.build'
    scratch.mkdir(exist_ok=True)
    with (scratch / '.bazel-publish.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        with tempfile.TemporaryDirectory(prefix='npm-', dir=scratch) as temporary:
            staged = Path(temporary) / 'dist'
            shutil.copytree(product, staged)
            # Bazel tree artifacts are read-only. Normalize only our staged
            # copy so publication and subsequent package builds can replace it.
            for path in [staged, *staged.rglob('*')]:
                path.chmod(0o755 if path.is_dir() else 0o644)
            destination = root / 'dist'
            if destination.is_symlink():
                raise ValueError('Preserving a symlink at the package publication path')
            previous = Path(temporary) / 'previous-dist'
            if destination.exists():
                os.replace(destination, previous)
            try:
                os.replace(staged, destination)
            except BaseException:
                if previous.exists():
                    os.replace(previous, destination)
                raise


if __name__ == '__main__':
    main()
