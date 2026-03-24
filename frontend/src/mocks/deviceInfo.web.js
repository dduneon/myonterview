// 웹 환경에서 react-native-device-info 대체 mock
module.exports = {
  getTotalMemory: async () => 8 * 1024 * 1024 * 1024, // 8GB로 고정 (항상 고사양 취급)
  default: {
    getTotalMemory: async () => 8 * 1024 * 1024 * 1024,
  },
};
