const path = require("path");

const expoDir = path.dirname(require.resolve("expo/package.json"));

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [require.resolve("babel-preset-expo", { paths: [expoDir] })],
  };
};
