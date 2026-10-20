import { View, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { EmptyState, TopBar } from "@/components/ui";
import { colors, space } from "@/theme";

export default function TripHistory() {
  const router = useRouter();
  return (
    <View style={styles.screen}>
      <TopBar title="Trip history" onBack={() => router.back()} />
      <View style={styles.body}>
        <EmptyState
          icon="calendar"
          title="Your trips, by date"
          body="Ongoing, upcoming, and past trips will show up here."
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  body: { flex: 1, justifyContent: "center", paddingBottom: space[6] },
});
