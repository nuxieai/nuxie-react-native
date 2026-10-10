import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("native_dependencies", Path(__file__).with_name("native-dependencies.py"))
scanner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scanner)


class PnpmDependencyTopologyTests(unittest.TestCase):
    def test_cycles_are_described_as_links_and_external_dependencies_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            modules = root / "node_modules"
            react = modules / ".pnpm/react/node_modules/react-native"
            codegen = modules / ".pnpm/codegen/node_modules/@react-native/codegen"
            for package in (react, codegen):
                package.mkdir(parents=True)
                (package / "package.json").write_text(json.dumps({"version": "0.87.1"}))
            (modules / "react-native").symlink_to(react, target_is_directory=True)
            scoped = react.parent / "@react-native"
            scoped.mkdir()
            (scoped / "codegen").symlink_to(codegen, target_is_directory=True)
            (codegen / "cycle").symlink_to(react.parent, target_is_directory=True)
            tree = scanner.dependency_tree(modules)
            self.assertEqual(len(tree["files"]), 2)
            self.assertEqual(len(tree["links"]), 3)
            self.assertTrue(tree["reactNativePackage"].startswith("node_modules/.pnpm/"))
            (modules / "external").symlink_to(root, target_is_directory=True)
            with self.assertRaisesRegex(ValueError, "escapes the owning SDK"):
                scanner.dependency_tree(modules)


class OfficialCodegenTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.node = shutil.which("node")
        if not cls.node or not (ROOT / "node_modules/react-native/package.json").is_file():
            raise unittest.SkipTest("Install the pinned SDK pnpm dependencies to exercise official codegen")
        cls.tree = scanner.dependency_tree(ROOT / "node_modules")

    def generate(self, directory, source, platform="android"):
        directory.mkdir()
        dependencies = directory / "dependencies"
        dependencies.mkdir()
        (dependencies / "node_modules").symlink_to(ROOT / "node_modules", target_is_directory=True)
        (dependencies / "dependency-tree.json").write_text(json.dumps(self.tree))
        path = directory / "NativeNuxie.ts"
        path.write_text(source)
        manifest = {"package": str(ROOT / "package.json"), "platform": platform,
                    "sources": [str(path)], "dependencies": str(dependencies / "dependency-tree.json"),
                    "schema": str(directory / "schema.json"), "output": str(directory / "generated"),
                    "java": str(directory / "NativeNuxieSpec.java") if platform == "android" else None}
        receipt = directory / "action.json"
        receipt.write_text(json.dumps(manifest))
        result = subprocess.run([self.node, str(ROOT / "scripts/bazel/codegen.mjs"), str(receipt)],
                                check=True, text=True, capture_output=True)
        return directory / ("NativeNuxieSpec.java" if platform == "android" else "generated/NuxieSpec/NuxieSpec.h")

    def test_android_uses_real_turbomodule_codegen_and_reacts_to_spec_changes(self):
        source = (ROOT / "src/specs/NativeNuxie.ts").read_text()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            first = self.generate(root / "first", source).read_text()
            self.assertIn("class NativeNuxieSpec extends ReactContextBaseJavaModule implements TurboModule", first)
            self.assertIn('NAME = "Nuxie"', first)
            self.assertIn("void configure(String configuration, Promise promise)", first)
            self.assertIn("emitOnEvent(String value)", first)
            second = self.generate(root / "second", source).read_text()
            self.assertEqual(first, second)
            changed = source.replace("  readonly onEvent:", "  getBridgeVersion(session: string): Promise<string>;\n  readonly onEvent:")
            generated = self.generate(root / "changed", changed).read_text()
            self.assertNotIn("getBridgeVersion", first)
            self.assertIn("void getBridgeVersion(String session, Promise promise)", generated)

    def test_ios_produces_the_host_shims_actual_codegen_header(self):
        source = (ROOT / "src/specs/NativeNuxie.ts").read_text()
        with tempfile.TemporaryDirectory() as directory:
            generated = self.generate(Path(directory) / "ios", source, "ios").read_text()
            self.assertIn("@protocol NativeNuxieSpec", generated)
            self.assertIn("NativeNuxieSpecBase", generated)
            self.assertIn("NativeNuxieSpecJSI", generated)


class CodegenLauncherTests(unittest.TestCase):
    def test_cli_runs_when_its_checkout_path_contains_url_characters(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("Node is required for the CLI regression")
        with tempfile.TemporaryDirectory(prefix="nuxie-codegen # ") as directory:
            root = Path(directory)
            runner = root / "codegen #.mjs"
            shutil.copy2(ROOT / "scripts/bazel/codegen.mjs", runner)
            package = root / "package.json"
            package.write_text(json.dumps({"codegenConfig": {"name": "Incorrect"}}))
            manifest = root / "action.json"
            manifest.write_text(json.dumps({"package": str(package)}))
            result = subprocess.run([node, str(runner), str(manifest)], text=True, capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("authored NuxieSpec modules configuration", result.stderr)


if __name__ == "__main__":
    unittest.main()
