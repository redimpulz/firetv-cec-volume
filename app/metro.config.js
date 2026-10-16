const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

// ../adbshell is installed as a symlink, so tell Metro where it lives.
const adbshell = path.resolve(__dirname, '../adbshell');

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  watchFolders: [adbshell],
  resolver: {
    nodeModulesPaths: [path.resolve(__dirname, 'node_modules'), path.join(adbshell, 'node_modules')],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
