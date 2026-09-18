const path = require('node:path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const withLabDefaults = require('../shared/metro-defaults.cjs');
module.exports = withLabDefaults(mergeConfig(getDefaultConfig(__dirname), {
  watchFolders: [path.resolve(__dirname, '../shared')],
  resolver: { nodeModulesPaths: [path.resolve(__dirname, 'node_modules')] },
}));
