# Bazel SDK builds

Run `pnpm --ignore-workspace install --frozen-lockfile` in this SDK checkout.
`pnpm run build`, `pnpm run typecheck`, and `pnpm run test` invoke Bazel's direct
Bun and TypeScript actions. Node24.14.1 and Bun1.3.11 are checksum-pinned;
`pnpm-lock.yaml` and the installed dependency files are declared action inputs.
Only `dist/` is published back into this checkout.
JavaScript builds and tests do not require an Android SDK. Native Android
compilation requires API37/build-tools37.0.0; the frontend exposes installed
`android-37.0` platforms through a checkout-local SDK view without changing
the machine's Android installation.

`pnpm run prepare:native` prepares the pinned Android SDK through its Bazel
producer and retains the source-addressed Maven coordinate and dependency POM
used by npm consumers. `pnpm run build:native` also prepares the iOS simulator
product and compiles the owned Swift and Kotlin bridges. React Native codegen
uses the owning pinned React Native package. CocoaPods/React C++ integration,
bare and Expo app builds remain independent consumer compatibility checks in
`node scripts/check.mjs`.

Bazel9.3.0 is selected by `.bazelversion`. The launcher uses an installed
Bazelisk, or installs the checksummed standalone fallback. Buildkite sources
`ci-cache.sh` and invokes the same package and bridge commands as local builds.

All SDKs and nuxie-runtime share action, download and repository-content caches
under `~/.cache/nuxie/bazel`. Set an absolute `NUXIE_BAZEL_CACHE_DIR` to relocate
those reusable caches. Buildkite uses the root/runtime per-agent cache directory
under `~/.nuxie-ci/editor-cargo-target/<agent>/bazel-shared-cache`.

Bazel derives a separate output base from every checkout's path. A shared
`NUXIE_BAZEL_OUTPUT_USER_ROOT` still contains separate output bases; do not set
one `--output_base` for multiple worktrees. Native clones, prepared products,
`dist/` and test scratch directories stay in their owning checkout or Bazel
sandbox. Use `NUXIE_BAZEL_JOBS=2` to bound local compiler concurrency.

Run the receipt/isolation/frontend oracles with:

```sh
python3 -B -m unittest discover -s scripts/bazel -p 'test_*.py'
```
