#!/usr/bin/env python3
"""Prepare pinned native Bazel products inside the downstream checkout."""
import fcntl
import json
import os
import platform
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile


def checkout(root, sdk, pin):
    source = root / '.native' / sdk
    source.parent.mkdir(exist_ok=True)
    if source.parent.is_symlink() or source.is_symlink():
        raise ValueError('Preserving symlinked native checkout: ' + str(source))
    existed = source.exists()
    if not existed:
        subprocess.run(['git', 'clone', '--no-checkout', pin['repository'], str(source)], check=True)
    if existed and subprocess.check_output(['git', 'status', '--porcelain'], cwd=source, text=True).strip():
        raise ValueError('Preserving modified native checkout: ' + str(source))
    subprocess.run(['git', 'fetch', 'origin', pin['revision']], cwd=source, check=True)
    subprocess.run(['git', 'checkout', '--detach', pin['revision']], cwd=source, check=True)
    actual = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=source, text=True).strip()
    if actual != pin['revision']:
        raise ValueError('Native pin mismatch for ' + sdk)
    producer = source / 'scripts/bazel/sdk.py'
    if not producer.is_file():
        raise ValueError('The ' + sdk + ' pin needs its landed Bazel build migration')
    return source, producer


def supplied_artifacts(sdk, pin, configuration='Debug', selected=None):
    value = selected
    if sdk == 'ios':
        if configuration not in ('Debug', 'Release'):
            raise ValueError('Select the Debug or Release iOS configuration')
        value = value or os.environ.get('NUXIE_IOS_' + configuration.upper() + '_ARTIFACTS')
    value = value or os.environ.get('NUXIE_' + sdk.upper() + '_ARTIFACTS')
    if not value:
        return None
    selected = Path(value).expanduser()
    if not selected.is_absolute():
        raise ValueError('Native artifact overrides must use absolute paths')
    manifest = selected / 'sdk-artifacts.json' if selected.is_dir() else selected
    from native_artifacts import inventory
    receipt, _, _, _ = inventory(manifest, sdk, pin['revision'])
    if sdk == 'ios' and not any(product.get('configuration') == configuration
            and product.get('platform') == 'ios-simulator' and platform.machine() in product.get('architectures', [])
            for product in receipt.get('products', [])):
        raise ValueError('Prepared iOS artifacts do not contain the requested ' + configuration + ' configuration, simulator platform and host architecture')
    return manifest


def publish_android_products(manifest, destination, root, revision):
    from native_artifacts import inventory
    destination = Path(destination).absolute()
    if destination.is_symlink() or destination.resolve() == root or not destination.resolve().is_relative_to(root):
        raise ValueError('Android package products must belong to this checkout')
    _, source, files, links = inventory(manifest, 'android', revision)
    if destination.resolve() == source:
        return manifest
    if source.is_relative_to(destination.resolve()) or destination.resolve().is_relative_to(source):
        raise ValueError('Android package publication must not overlap its supplied producer')
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.maven-', dir=destination.parent) as temporary:
        stage = Path(temporary) / 'products'
        stage.mkdir()
        for name in files:
            target = stage / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source / name, target)
            target.chmod(0o644)
        for name, target in links.items():
            link = stage / name
            link.parent.mkdir(parents=True, exist_ok=True)
            link.symlink_to(target)
        shutil.copy2(manifest, stage / 'sdk-artifacts.json')
        (stage / 'sdk-artifacts.json').chmod(0o644)
        inventory(stage / 'sdk-artifacts.json', 'android', revision)
        previous = Path(temporary) / 'previous'
        if destination.exists():
            os.replace(destination, previous)
        try:
            os.replace(stage, destination)
        except BaseException:
            if previous.exists():
                os.replace(previous, destination)
            raise
    return destination / 'sdk-artifacts.json'


def prepare(root, sdks, configuration='Debug', android_output=None):
    mode = os.environ.get('NUXIE_NATIVE_PREPARED_ONLY', '0')
    if mode not in ('0', '1'):
        raise ValueError('NUXIE_NATIVE_PREPARED_ONLY must be 0 or 1')
    root = Path(root).resolve()
    pins = json.loads((root / 'NATIVE-PINS.json').read_text())
    native = root / '.native'
    if native.is_symlink() or (native / '.prepare.lock').is_symlink():
        raise ValueError('Preserving symlinked native checkout or preparation lock')
    native.mkdir(exist_ok=True)
    products = {}
    with (native / '.prepare.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        for sdk in sdks:
            selected = None
            if mode == '1':
                # Only this job's exact earlier preparation, never a fresh clone
                # or a silently substituted producer during consumer checking.
                output = android_output if sdk == 'android' and android_output is not None else native / 'artifacts' / sdk
                selected = str(Path(output) / 'sdk-artifacts.json')
            supplied = supplied_artifacts(sdk, pins[sdk], configuration, selected)
            if mode == '1' and not supplied:
                raise ValueError('Missing selected native producer receipt')
            if supplied:
                if sdk == 'android' and android_output is not None:
                    supplied = publish_android_products(supplied, android_output, root, pins[sdk]['revision'])
                products[sdk] = supplied
                continue
            approval = None
            if os.environ.get('NUXIE_CI_RUNNER_POLICY_VERSION') == '2':
                from native_producer_policy import qualification
                approval = qualification(sdk, pins[sdk])
            source, producer = checkout(root, sdk, pins[sdk])
            if sdk == 'ios':
                if sys.platform != 'darwin':
                    raise ValueError('iOS native preparation requires macOS')
                architecture = platform.machine()
                if architecture not in ('arm64', 'x86_64'):
                    raise ValueError('Unsupported simulator host architecture: ' + architecture)
                command = [sys.executable, str(producer), 'prepare', '--output', str(native / 'artifacts/ios'),
                           '--configuration', configuration, '--platform', 'ios-simulator', '--architecture', architecture]
            else:
                output = android_output or native / 'artifacts/android'
                command = [sys.executable, str(producer), 'prepare', '--output', str(output),
                           '--maven-version', '0.2.0-' + pins[sdk]['revision']]
            if approval is not None:
                from native_producer_policy import verify
                verify(source, sdk, pins[sdk], approval)
                command[1:1] = ['-I', '-B']
            environment = dict(os.environ)
            if approval is not None:
                environment['PYTHONDONTWRITEBYTECODE'] = '1'
            subprocess.run(command, cwd=source, env=environment, check=True)
            manifest = Path(command[command.index('--output') + 1]) / 'sdk-artifacts.json'
            products[sdk] = supplied_artifacts(sdk, pins[sdk], configuration, str(manifest))
    return products
