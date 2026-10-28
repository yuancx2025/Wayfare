import { useEffect } from "react";
import { StyleSheet } from "react-native";
import { Stack, ThemeProvider, DefaultTheme } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts, Manrope_700Bold, Manrope_800ExtraBold } from "@expo-google-fonts/manrope";
import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold } from "@expo-google-fonts/dm-sans";
import * as SplashScreen from "expo-splash-screen";
import { StoreProvider, useStore } from "@/state/store";
import { TripSessionProvider } from "@/state/tripSession";
import { LocationProvider } from "@/state/location";
import { LocationPermissionProvider } from "@/state/locationPermission";
import { Toast } from "@/components/ui";
import { colors } from "@/theme";

SplashScreen.preventAutoHideAsync().catch(() => undefined);

const queryClient = new QueryClient();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.forest,
    background: colors.paper,
    card: colors.paper,
    text: colors.ink,
    border: colors.line,
    notification: colors.coral,
  },
};

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Manrope_700Bold,
    Manrope_800ExtraBold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
  });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync().catch(() => undefined);
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StoreProvider>
            <TripSessionProvider>
              <LocationPermissionProvider>
                <LocationProvider>
                  <ThemeProvider value={navTheme}>
                    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }} />
                    <ToastHost />
                  </ThemeProvider>
                </LocationProvider>
              </LocationPermissionProvider>
            </TripSessionProvider>
          </StoreProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function ToastHost() {
  const { toast } = useStore();
  return <Toast message={toast} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
