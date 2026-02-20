const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const openWebuiDir = path.resolve(__dirname, 'open-webui');
const config = {
  resolver: {
    blockList: [new RegExp(openWebuiDir.replace(/[/\\]/g, '[/\\\\]') + '.*')],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
