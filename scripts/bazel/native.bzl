"""Official React Native codegen actions for the declared TurboModule specs."""

def _native_codegen_impl(ctx):
    schema = ctx.actions.declare_file(ctx.label.name + "/schema.json")
    output = ctx.actions.declare_directory(ctx.label.name + "/generated")
    java = ctx.actions.declare_file(ctx.label.name + "/NativeNuxieSpec.java") if ctx.attr.platform == "android" else None
    manifest = ctx.actions.declare_file(ctx.label.name + "/action.json")
    ctx.actions.write(manifest, json.encode({
        "platform": ctx.attr.platform,
        "package": ctx.file.package.path,
        "sources": [source.path for source in ctx.files.srcs],
        "dependencies": ctx.file._tree.path,
        "schema": schema.path,
        "output": output.path,
        "java": java.path if java else None,
    }))
    ctx.actions.run(
        executable = ctx.file._node,
        arguments = [ctx.file._runner.path, manifest.path],
        inputs = depset(ctx.files.srcs + [ctx.file.package, ctx.file._runner, ctx.file._tree, manifest],
                        transitive = [ctx.attr._dependencies[DefaultInfo].files]),
        tools = [ctx.file._node],
        outputs = [schema, output] + ([java] if java else []),
        env = {"PATH": "/usr/bin:/bin"},
        mnemonic = "NuxieReactNativeCodegen",
    )
    return [DefaultInfo(files = depset([java] if java else [output])),
            OutputGroupInfo(schema = depset([schema]), generated = depset([output]))]

native_codegen = rule(
    implementation = _native_codegen_impl,
    attrs = {
        "srcs": attr.label_list(allow_files = [".ts", ".tsx", ".js"], mandatory = True),
        "package": attr.label(allow_single_file = True, mandatory = True),
        "platform": attr.string(mandatory = True, values = ["android", "ios"]),
        "_node": attr.label(default = "@nuxie_js_tools//:node/bin/node", allow_single_file = True, cfg = "exec"),
        "_runner": attr.label(default = Label(":codegen.mjs"), allow_single_file = True),
        "_tree": attr.label(default = "@nuxie_codegen_dependencies//:dependency-tree.json", allow_single_file = True),
        "_dependencies": attr.label(default = "@nuxie_codegen_dependencies//:dependencies"),
    },
)
