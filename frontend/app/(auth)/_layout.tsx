import { Stack } from "expo-router";
import { colors } from "@/theme";

// Sign-in sits at the bottom of this stack, so deep links to other auth screens can go back to it.
export const unstable_settings = { initialRouteName: "sign-in" };

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }}>
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="sign-up" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="verify" />
      {/* No swipe-back: the reset code has already been used. */}
      <Stack.Screen name="reset-password" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
