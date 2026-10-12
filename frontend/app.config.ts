import type { ExpoConfig } from "expo/config";

// Android renders react-native-maps with Google Maps, which needs a key in a development build. iOS uses Apple Maps.
const androidGoogleMapsApiKey = process.env.GOOGLE_MAPS_ANDROID_KEY;

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
  ],
};

export default config;
