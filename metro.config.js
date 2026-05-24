const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {};

const defaultConfig = getDefaultConfig(__dirname);
defaultConfig.resolver.assetExts.push('tflite');

module.exports = mergeConfig(defaultConfig, config);
