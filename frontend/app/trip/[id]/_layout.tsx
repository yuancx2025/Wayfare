import { Stack } from "expo-router";
import { colors } from "@/theme";

export default function TripLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }} />;
}
