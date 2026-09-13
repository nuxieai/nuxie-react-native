/** Nuxie autolinks in Expo development builds. No native app mutation is required. */
module.exports = function withNuxie(config, options = {}) {
  if (Object.keys(options).length) throw new Error('Nuxie config plugin has no options. Pass public API keys to NuxieProvider in JavaScript.');
  return config;
};
