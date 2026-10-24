import { Stack } from "expo-router";
import { colors } from "@/theme";

export default function ProfileLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }} />;
}
