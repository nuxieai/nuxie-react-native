#!/usr/bin/env python3
"""Describe pnpm's physical files and relative links without following cycles."""

import json
import os
from pathlib import Path
import sys


def dependency_tree(modules: Path) -> dict:
    modules = modules.resolve()
    files, links = [], {}
    for directory, directories, names in os.walk(modules, followlinks=False):
        directories[:] = sorted(name for name in directories if name != ".cache")
        for name in sorted(directories + names):
            path = Path(directory) / name
            relative = "node_modules/" + path.relative_to(modules).as_posix()
            if path.is_symlink():
                target = path.resolve()
                if not target.is_relative_to(modules):
                    raise ValueError("A pnpm dependency link escapes the owning SDK node_modules: " + relative)
                links[relative] = os.path.relpath(target, path.parent)
            elif path.is_file():
                files.append(relative)
    react = (modules / "react-native").resolve()
    codegen = (react.parent / "@react-native/codegen").resolve()
    for package in (react, codegen):
        if not package.is_relative_to(modules):
            raise ValueError("Install the SDK's standalone pnpm dependency tree first")
        metadata = json.loads((package / "package.json").read_text())
        if metadata["version"] != "0.87.1":
            raise ValueError("Native code generation requires React Native and codegen 0.87.1")
    def reference(path):
        return "node_modules/" + path.relative_to(modules).as_posix()
    return {"files": sorted(files), "links": links,
            "reactNativePackage": reference(react / "package.json"),
            "codegenPackage": reference(codegen / "package.json"),
            "combineCli": reference(codegen / "lib/cli/combine/combine-js-to-schema-cli.js"),
            "generateCli": reference(react / "scripts/generate-specs-cli.js")}


if __name__ == "__main__":
    print(json.dumps(dependency_tree(Path(sys.argv[1]))))
