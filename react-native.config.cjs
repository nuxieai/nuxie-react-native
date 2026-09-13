module.exports = { dependency: { platforms: {
  ios: { podspecPath: 'NuxieReactNative.podspec' },
  android: { sourceDir: 'android', packageImportPath: 'import ai.nuxie.reactnative.NuxiePackage;', packageInstance: 'new NuxiePackage()' },
} } };
