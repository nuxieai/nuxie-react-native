"""Declare the pinned React Native codegen package tree, including pnpm links."""

def _native_dependencies_impl(ctx):
    modules = ctx.path(ctx.attr.lock).dirname.get_child("node_modules")
    if not modules.exists:
        fail("Run pnpm --ignore-workspace install --frozen-lockfile in the React Native SDK first")
    python = ctx.which("python3")
    if python == None:
        fail("python3 is required to describe the installed pnpm codegen inputs")
    result = ctx.execute([python, ctx.path(ctx.attr.scanner), modules])
    if result.return_code:
        fail("Cannot declare React Native codegen inputs:\n" + result.stderr)
    tree = json.decode(result.stdout)
    ctx.symlink(modules, "node_modules")
    ctx.file("dependency-tree.json", result.stdout)
    ctx.symlink(ctx.path(ctx.attr.lock), "pnpm-lock.yaml")
    ctx.file("BUILD.bazel", "package(default_visibility = [\"//visibility:public\"])\n" +
             "exports_files([\"dependency-tree.json\"])\n" +
             "filegroup(name = \"dependencies\", srcs = " + repr(tree["files"] + ["pnpm-lock.yaml"]) + ")\n")

native_dependencies = repository_rule(
    implementation = _native_dependencies_impl,
    attrs = {
        "lock": attr.label(allow_single_file = True, mandatory = True),
        "scanner": attr.label(default = Label(":native-dependencies.py"), allow_single_file = True),
    },
    local = True,
)
