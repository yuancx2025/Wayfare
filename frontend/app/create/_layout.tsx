import { Stack } from "expo-router";
import { colors } from "@/theme";

export default function CreateLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.cream } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="preferences" />
      <Stack.Screen name="generating" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
