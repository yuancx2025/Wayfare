import type { ExpoConfig } from "expo/config";

// Expo CLI loads frontend/.env before evaluating this file. This key goes into the
// native Android manifest when building; Expo Go cannot use this configuration.
const androidGoogleMapsApiKey = process.env.GOOGLE_MAPS_ANDROID_KEY?.trim();

const config: ExpoConfig = {
  name: "travel_companion_expo",
  slug: "travel_companion_expo",
  version: "1.0.0",
  orientation: "portrait",
  scheme: "travelcompanion",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  ios: {
    supportsTablet: true,
  },
  android: {
    package: "com.yuancx2025.wayfare",
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  plugins: [
    "expo-router",
    "expo-image",
    "expo-font",
    "@react-native-community/datetimepicker",
    "expo-splash-screen",
    ["react-native-maps", { androidGoogleMapsApiKey }],
    [
      "expo-location",
      { locationWhenInUsePermission: "Wayfare uses your location only when you ask, to show places near you." },
    ],
  ],
};

export default config;
