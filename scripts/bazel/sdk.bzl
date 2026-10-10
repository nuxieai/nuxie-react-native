"""Direct Bun and TypeScript actions for the npm SDK."""

_TOOL_ATTRS = {
    "srcs": attr.label_list(allow_files = True),
    "_runner": attr.label(default = "//scripts/bazel:compile.mjs", allow_single_file = True),
    "_node": attr.label(default = "@nuxie_js_tools//:node/bin/node", allow_single_file = True, cfg = "exec"),
    "_bun": attr.label(default = "@nuxie_js_tools//:bun/bun", allow_single_file = True, cfg = "exec"),
    "_tsc": attr.label(default = "@nuxie_js_dependencies//:node_modules/typescript/bin/tsc", allow_single_file = True, cfg = "exec"),
    "_dependencies": attr.label(default = "@nuxie_js_dependencies//:dependencies"),
}

def _file_path(file, runfiles):
    return file.short_path if runfiles else file.path

def _manifest(ctx, mode, output = None, runfiles = False):
    manifest = ctx.actions.declare_file(ctx.label.name + ".json")
    ctx.actions.write(manifest, json.encode({
        "mode": mode,
        "sources": {f.short_path: _file_path(f, runfiles) for f in ctx.files.srcs},
        "node": _file_path(ctx.file._node, runfiles),
        "bun": _file_path(ctx.file._bun, runfiles),
        "tsc": _file_path(ctx.file._tsc, runfiles),
        "output": output.path if output else None,
    }))
    return manifest

def _build_impl(ctx):
    output = ctx.actions.declare_directory(ctx.label.name)
    manifest = _manifest(ctx, ctx.attr.mode, output)
    ctx.actions.run(
        executable = ctx.file._node,
        arguments = [ctx.file._runner.path, manifest.path],
        inputs = depset(ctx.files.srcs + [ctx.file._runner, manifest], transitive = [ctx.attr._dependencies[DefaultInfo].files]),
        tools = [ctx.file._node, ctx.file._bun, ctx.file._tsc],
        outputs = [output],
        env = {"PATH": "/usr/bin:/bin", "BUN_TELEMETRY_DISABLE": "1"},
        mnemonic = "Nuxie" + ctx.attr.mode.title(),
    )
    return [DefaultInfo(files = depset([output]))]

_build_attrs = dict(_TOOL_ATTRS)
_build_attrs["mode"] = attr.string(mandatory = True, values = ["bundle", "declarations", "typecheck"])
js_compile = rule(implementation = _build_impl, attrs = _build_attrs)

def _package_impl(ctx):
    output = ctx.actions.declare_directory(ctx.label.name)
    ctx.actions.run_shell(
        inputs = [ctx.file.bundle, ctx.file.declarations],
        outputs = [output],
        arguments = [ctx.file.bundle.path, ctx.file.declarations.path, output.path],
        command = 'mkdir -p "$3"; cp -R "$1/." "$3/"; cp -R "$2/." "$3/"',
        mnemonic = "NuxieNpmDistribution",
    )
    return [DefaultInfo(files = depset([output]))]
js_distribution = rule(implementation = _package_impl, attrs = {
    "bundle": attr.label(mandatory = True, allow_single_file = True),
    "declarations": attr.label(mandatory = True, allow_single_file = True),
})

def _test_impl(ctx):
    manifest = _manifest(ctx, "test", runfiles = True)
    launcher = ctx.actions.declare_file(ctx.label.name + ".sh")
    ctx.actions.write(launcher, "#!/usr/bin/env bash\nset -euo pipefail\ncd \"$TEST_SRCDIR/$TEST_WORKSPACE\"\nexec \"" + ctx.file._node.short_path + "\" \"" + ctx.file._runner.short_path + "\" \"" + manifest.short_path + "\"\n", is_executable = True)
    files = ctx.files.srcs + [manifest, ctx.file._runner, ctx.file._node, ctx.file._bun, ctx.file._tsc]
    runfiles = ctx.runfiles(files = files, transitive_files = ctx.attr._dependencies[DefaultInfo].files)
    return [DefaultInfo(executable = launcher, runfiles = runfiles)]
js_test = rule(implementation = _test_impl, attrs = _TOOL_ATTRS, test = True)
