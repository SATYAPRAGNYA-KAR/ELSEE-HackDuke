import 'dotenv/config';

export default {
  expo: {
    name: "SeeForMe",
    slug: "seefore",
    version: "1.0.0",
    sdkVersion: "54.0.0",
    orientation: "portrait",
    userInterfaceStyle: "dark",
    splash: { backgroundColor: "#080B12" },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.seefore.app",
      infoPlist: {
        NSCameraUsageDescription: "SeeForMe uses camera to detect obstacles.",
        NSMicrophoneUsageDescription: "SeeForMe uses microphone for voice queries.",
      },
    },
    android: {
      package: "com.seefore.app",
      // FIX: Added all required permissions explicitly
      permissions: [
        "android.permission.CAMERA",
        "android.permission.RECORD_AUDIO",
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.WRITE_EXTERNAL_STORAGE",
      ],
    },
    plugins: [
      "expo-router",
      // FIX: expo-av plugin config to enable microphone
      ["expo-av", { microphonePermission: "Allow SeeForMe to use your microphone for voice queries." }],
      // FIX: expo-camera plugin config to enable camera
      ["expo-camera", { cameraPermission: "Allow SeeForMe to use your camera to detect obstacles." }],
    ],
    scheme: "seefore",
    extra: {
      // These are readable via Constants.expoConfig.extra in app code
      // But prefer process.env.EXPO_PUBLIC_* directly in components
      geminiApiKey: process.env.EXPO_PUBLIC_GEMINI_API_KEY,
      elevenlabsKey: process.env.EXPO_PUBLIC_ELEVENLABS_KEY,
    },
  },
};