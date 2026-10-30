import { useEffect, useState, type ReactNode } from "react";
import { StyleSheet } from "react-native";
import { Stack, ThemeProvider, DefaultTheme } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClerkProvider } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { useFonts, Manrope_700Bold, Manrope_800ExtraBold } from "@expo-google-fonts/manrope";
import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold } from "@expo-google-fonts/dm-sans";
import * as SplashScreen from "expo-splash-screen";
import { AuthSessionProvider, useAuthSession, type AuthMode } from "@/auth/session";
import { ApiProvider } from "@/lib/api";
import { StoreProvider, useStore } from "@/state/store";
import { TripSessionProvider } from "@/state/tripSession";
import { Toast } from "@/components/ui";
import { CLERK_PUBLISHABLE_KEY } from "@/config";
import { colors } from "@/theme";

SplashScreen.preventAutoHideAsync().catch(() => undefined);

if (!CLERK_PUBLISHABLE_KEY) {
  throw new Error("Add EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY to frontend/.env (see .env.example), then restart Expo.");
}

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
  return (
    // The token cache keeps the Clerk session in SecureStore so it survives app restarts.
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
      <AuthSessionProvider>
        <ApiProvider>
          <AppShell />
        </ApiProvider>
      </AuthSessionProvider>
    </ClerkProvider>
  );
}

function AppShell() {
  const [fontsLoaded, fontError] = useFonts({
    Manrope_700Bold,
    Manrope_800ExtraBold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
  });
  const { mode, userId } = useAuthSession();
  const ready = (fontsLoaded || !!fontError) && mode !== "loading";

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  // Keep the splash screen up until we know whether to show the app or the sign-in screen.
  if (!ready) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ThemeProvider value={navTheme}>
          {/* Signed-out screens only need on-device data, so they share the guest scope. */}
          <IdentityScope key={mode === "account" ? `account:${userId}` : "guest"}>
            <RootStack mode={mode} />
            <ToastHost />
          </IdentityScope>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Holds one identity's data. A new key (sign-in, sign-out, account switch) unmounts the previous query cache,
 * trip list and open screens, which aborts in-flight generation. The client is created here, not at module scope,
 * so it does not outlive the key.
 */
function IdentityScope({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <StoreProvider>
        <TripSessionProvider>{children}</TripSessionProvider>
      </StoreProvider>
    </QueryClientProvider>
  );
}

function RootStack({ mode }: { mode: AuthMode }) {
  const canUseApp = mode === "account" || mode === "guest";
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }}>
      {/* When a guard turns false, Expo Router removes those screens and moves to the first allowed one. */}
      <Stack.Protected guard={canUseApp}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="create" />
        <Stack.Screen name="trip/[id]" />
      </Stack.Protected>
      {/* Guests can still open sign-in from Profile; signed-in users never see these screens. */}
      <Stack.Protected guard={mode !== "account"}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}

function ToastHost() {
  const { toast } = useStore();
  return <Toast message={toast} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
