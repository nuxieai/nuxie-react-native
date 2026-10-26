#!/usr/bin/env python3
"""Build the pinned native SDKs with Bazel for bridge checks and npm packing."""
import argparse
from pathlib import Path
import sys

from pool import dispatch

root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root / 'scripts/bazel'))
from native_prepare import prepare

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--platform', choices=['android', 'ios', 'all'], default='android')
parser.add_argument('--configuration', choices=['Debug', 'Release'], default='Debug')
args = parser.parse_args()
status = dispatch('prepare-native', sys.argv[1:], selected_platform=args.platform)
if status is not None: raise SystemExit(status)


prepare(root, ['ios', 'android'] if args.platform == 'all' else [args.platform], args.configuration,
        android_output=root / 'android/maven')
print('Pinned native Bazel artifacts and Maven dependency metadata ready.')
