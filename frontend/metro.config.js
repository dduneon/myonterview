const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// 웹에서 네이티브 전용 모듈을 빈 mock으로 대체
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web") {
    if (moduleName === "react-native-device-info") {
      return {
        type: "sourceFile",
        filePath: require.resolve("./src/mocks/deviceInfo.web.js"),
      };
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
