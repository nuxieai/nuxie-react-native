"""Pinned compiler tools and the owning pnpm dependency tree."""

_NODE_VERSION = "24.14.1"
_BUN_VERSION = "1.3.11"
_TOOLS = {
    "darwin-arm64": ["darwin-arm64", "25495ff85bd89e2d8a24d88566d7e2f827c6b0d3d872b2cebf75371f93fcb1fe", "darwin-aarch64", "6f5a3467ed9caec4795bf78cd476507d9f870c7d57b86c945fcb338126772ffc"],
    "darwin-x64": ["darwin-x64", "2526230ad7d922be82d4fdb1e7ee1e84303e133e3b4b0ec4c2897ab31de0253d", "darwin-x64", "c4fe2b9247218b0295f24e895aaec8fee62e74452679a9026b67eacbd611a286"],
    "linux-arm64": ["linux-arm64", "734ff04fa7f8ed2e8a78d40cacf5ac3fc4515dac2858757cbab313eb483ba8a2", "linux-aarch64", "d13944da12a53ecc74bf6a720bd1d04c4555c038dfe422365356a7be47691fdf"],
    "linux-x64": ["linux-x64", "ace9fa104992ed0829642629c46ca7bd7fd6e76278cb96c958c4b387d29658ea", "linux-x64", "8611ba935af886f05a6f38740a15160326c15e5d5d07adef966130b4493607ed"],
}

def _tools_impl(ctx):
    os_name = "darwin" if ctx.os.name == "mac os x" else ctx.os.name
    arch = {"aarch64": "arm64", "arm64": "arm64", "amd64": "x64", "x86_64": "x64"}.get(ctx.os.arch, ctx.os.arch)
    platform = os_name + "-" + arch
    if platform not in _TOOLS:
        fail("Nuxie JS compilers support macOS/Linux on arm64/x64; got " + platform)
    node_platform, node_sha, bun_platform, bun_sha = _TOOLS[platform]
    node_prefix = "node-v" + _NODE_VERSION + "-" + node_platform
    ctx.download_and_extract(
        url = "https://nodejs.org/dist/v" + _NODE_VERSION + "/" + node_prefix + ".tar.gz",
        sha256 = node_sha,
        strip_prefix = node_prefix,
        output = "node",
    )
    ctx.download_and_extract(
        url = "https://github.com/oven-sh/bun/releases/download/bun-v" + _BUN_VERSION + "/bun-" + bun_platform + ".zip",
        sha256 = bun_sha,
        strip_prefix = "bun-" + bun_platform,
        output = "bun",
    )
    ctx.file("BUILD.bazel", 'package(default_visibility = ["//visibility:public"])\nexports_files(["node/bin/node", "bun/bun"])\n')

js_tools = repository_rule(implementation = _tools_impl)

def _dependencies_impl(ctx):
    workspace = ctx.path(ctx.attr.lock).dirname
    modules = workspace.get_child("node_modules")
    if not modules.exists:
        fail("Run pnpm --ignore-workspace install --frozen-lockfile in the SDK checkout first")
    ctx.symlink(modules, "node_modules")
    ctx.symlink(ctx.path(ctx.attr.lock), "pnpm-lock.yaml")
    ctx.file("BUILD.bazel", 'package(default_visibility = ["//visibility:public"])\nfilegroup(name = "dependencies", srcs = glob(["node_modules/**/*.js", "node_modules/**/*.cjs", "node_modules/**/*.mjs", "node_modules/**/*.ts", "node_modules/**/*.tsx", "node_modules/**/*.json", "node_modules/**/*.node"], exclude = ["node_modules/.cache/**"], allow_empty = True) + ["pnpm-lock.yaml"])\nexports_files(["node_modules/typescript/bin/tsc"])\n')

js_dependencies = repository_rule(
    implementation = _dependencies_impl,
    attrs = {"lock": attr.label(mandatory = True, allow_single_file = True)},
    local = True,
)
