"""Compiler actions consume private copies and publish only declared products."""
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

RUNNER = Path(__file__).with_name('compile.mjs')


class CompilerIsolationTest(unittest.TestCase):
    def test_symlink_inputs_are_copied_without_mutating_source(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            owned = root / 'owned.ts'
            owned.write_text('export const original = true;\n')
            (root / 'index.ts').symlink_to(owned)
            modules = root / 'node_modules'
            compiler = modules / 'typescript/bin/tsc'
            compiler.parent.mkdir(parents=True)
            compiler.write_text('')
            bun = root / 'bun'
            bun.write_text('#!/bin/sh\nset -eu\n[ ! -L src/index.ts ]\nprintf "private compiler edit" > src/index.ts\nmkdir -p dist\nprintf "export const compiled = true;\\n" > dist/index.js\n')
            bun.chmod(0o755)
            output = root / 'products'
            manifest = root / 'inputs.json'
            manifest.write_text(json.dumps({'mode': 'bundle', 'sources': {'src/index.ts': str(root/'index.ts')},
                'node': shutil.which('node'), 'bun': str(bun), 'tsc': str(compiler), 'output': str(output)}))
            result = subprocess.run(['node', str(RUNNER), str(manifest)], cwd=root, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(owned.read_text(), 'export const original = true;\n')
            self.assertEqual((output/'index.js').read_text(), 'export const compiled = true;\n')

    def test_input_path_cannot_escape_private_workspace(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            input = root/'owned.ts'; input.write_text('owned')
            manifest = root/'inputs.json'
            manifest.write_text(json.dumps({'mode': 'bundle', 'sources': {'../outside.ts': str(input)},
                'node': shutil.which('node'), 'bun': '/bin/false', 'tsc': '/tmp/node_modules/typescript/bin/tsc', 'output': str(root/'products')}))
            result = subprocess.run(['node', str(RUNNER), str(manifest)], cwd=root, capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('Source escapes workspace', result.stderr)
            self.assertFalse((root/'products').exists())


if __name__ == '__main__':
    unittest.main()
