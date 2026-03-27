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
    // Metro가 웹에서도 "react-native" 필드를 우선 사용하기 때문에
    // @react-three/fiber의 native 버전(expo-gl 기반)이 선택됨.
    // 웹에서는 HTML Canvas 기반 web 버전으로 강제 교체.
    if (moduleName === "@react-three/fiber") {
      return {
        type: "sourceFile",
        filePath: require.resolve(
          "@react-three/fiber/dist/react-three-fiber.cjs.js"
        ),
      };
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
