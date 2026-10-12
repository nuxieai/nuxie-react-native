#!/usr/bin/env python3
"""Record successful owning checks without replacing native producer receipts."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/bazel'))
from native_artifacts import inventory


def git(*arguments):
    return subprocess.check_output(['git', *arguments], cwd=ROOT, text=True, timeout=30).strip()


def record(selected, environment=None):
    environment = os.environ if environment is None else environment
    revision = git('rev-parse', 'HEAD')
    if not re.fullmatch(r'[0-9a-f]{40}', revision) or environment.get('BUILDKITE_COMMIT') != revision:
        raise ValueError('Readiness requires this job exact source revision')
    if git('status', '--porcelain', '--untracked-files=no'):
        raise ValueError('Readiness preserves and rejects modified tracked source')
    identity = {}
    for name in ['BUILDKITE_BUILD_ID', 'BUILDKITE_JOB_ID']:
        value = environment.get(name, '')
        if not re.fullmatch(r'[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}', value):
            raise ValueError('Readiness requires exact Buildkite build and job identities')
        identity[name] = value
    selected_sdks = [] if selected == 'portable' else ['ios', 'android'] if selected == 'all' else [selected]
    pins, paths, pin_files = contract(revision)
    native = {}
    for sdk in selected_sdks:
        manifest = ROOT / paths[sdk]
        if manifest.is_symlink() or not manifest.is_file() or not manifest.resolve().is_relative_to(ROOT):
            raise ValueError('Readiness requires this checkout original selected native receipt')
        receipt, _, _, _ = inventory(manifest, sdk, pins[sdk]['revision'])
        if sdk == 'ios' and not any(item.get('platform') == 'ios-simulator' and item.get('configuration') == 'Debug'
                and platform.machine() in item.get('architectures', []) for item in receipt.get('products', [])):
            raise ValueError('Readiness iOS receipt must cover Debug simulator host architecture')
        native[sdk] = {'manifest': paths[sdk], 'manifestSha256': hashlib.sha256(manifest.read_bytes()).hexdigest(),
                       'sourceRevision': receipt['sourceRevision'], 'runtime': receipt.get('runtime'),
                       'products': receipt.get('products'), 'artifacts': receipt['artifacts'], 'symlinks': receipt.get('symlinks', [])}
    return {'schemaVersion': 1, 'sourceRevision': revision, 'sourceDirty': False, 'buildId': identity['BUILDKITE_BUILD_ID'],
            'jobId': identity['BUILDKITE_JOB_ID'], 'platform': selected, 'configuration': 'Debug',
            'architecture': platform.machine(), 'prerequisiteJobs': [],
            'pinFiles': {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in pin_files},
            'nativeProducts': native}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--platform', choices=['portable', 'android', 'ios', 'all'], required=True)
    receipt = record(parser.parse_args().platform)
    directory = ROOT / 'output/pipeline/readiness'
    for path in [ROOT / 'output', ROOT / 'output/pipeline', directory]:
        if path.is_symlink():
            raise ValueError('Refusing symlinked readiness evidence output')
    directory.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix='.readiness-', dir=directory)
    try:
        with os.fdopen(descriptor, 'w') as output:
            output.write(json.dumps(receipt, indent=2) + '\n')
        os.replace(temporary, directory / 'receipt.json')
    finally:
        Path(temporary).unlink(missing_ok=True)


def contract(revision):
    return json.loads((ROOT / 'NATIVE-PINS.json').read_text()), {'ios': '.native/artifacts/ios/sdk-artifacts.json', 'android': 'android/maven/sdk-artifacts.json'}, ['NATIVE-PINS.json']


if __name__ == '__main__':
    main()
