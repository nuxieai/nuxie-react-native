# Bare React Native SDK Lab

This host uses React Native 0.87.1 without Expo. It loads the shared [SDK Lab](../shared/lab.tsx).

Prepare the SDK's pinned native artifacts, install this host's dependencies, install iOS pods, then run `pnpm --ignore-workspace ios` or `pnpm --ignore-workspace android`. See [development instructions](../../docs/development.md).

The Android settings resolve React Native's Gradle plugin through Node so pnpm's isolated dependencies work. Configure your public development keys in the Lab and use an existing Feature/trigger from that app.
