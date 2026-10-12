module.exports = function (api) {
  api.cache(true)
  return {
    // babel-preset-expo (SDK 57) adds the `react-native-worklets/plugin`
    // itself whenever react-native-worklets resolves from this app (it's a
    // direct dependency for Reanimated 4), so no manual plugin entry here —
    // adding it again would run the worklets transform twice.
    presets: ["babel-preset-expo"],
  }
}
