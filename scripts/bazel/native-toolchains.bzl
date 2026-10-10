"""Bridge Kotlin settings matching pinned React Native 0.87.1's Android build."""

load("@rules_kotlin//kotlin:core.bzl", "define_kt_toolchain", "kt_javac_options", "kt_kotlinc_options")

def native_kotlin_toolchain(name):
    kt_kotlinc_options(name = name + "_kotlinc", jvm_target = "17", x_jvm_default = "all")
    kt_javac_options(name = name + "_javac", release = "17")
    define_kt_toolchain(
        name = name,
        language_version = "2.2",
        api_version = "2.2",
        jvm_target = "17",
        kotlinc_options = ":" + name + "_kotlinc",
        javac_options = ":" + name + "_javac",
        experimental_build_tools_api = False,
        jvm_stdlibs = ["@rn_maven//:org_jetbrains_kotlin_kotlin_stdlib", "@rules_kotlin//kotlin/compiler:annotations"],
        jvm_runtime = ["@rn_maven//:org_jetbrains_kotlin_kotlin_stdlib"],
    )
