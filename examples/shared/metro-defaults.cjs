const fs = require('node:fs');
const path = require('node:path');

// Keep unattended Lab configuration local and out of release bundles.
module.exports = function withLabDefaults(config) {
  const resolve = config.resolver.resolveRequest;
  const defaults = path.join(__dirname, 'defaults');
  const local = path.join(__dirname, 'local-defaults.json');
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (context.dev && moduleName.startsWith('.') &&
        path.resolve(path.dirname(context.originModulePath), moduleName) === defaults &&
        fs.existsSync(local)) {
      return { type: 'sourceFile', filePath: local };
    }
    return (resolve ?? context.resolveRequest)(context, moduleName, platform);
  };
  return config;
};
