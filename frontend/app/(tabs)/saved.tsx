import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Button, EmptyState, TopBar } from "@/components/ui";
import { colors } from "@/theme";

/** Navigation shell; place persistence is delivered in the next increment. */
export default function SavedPlaces() {
  const router = useRouter();
  return <View style={styles.screen}>
    <TopBar title="Saved places" />
    <View style={styles.body}>
      <EmptyState icon="bookmark" title="Keep your next discovery close." body="Place saving is coming soon. Explore destinations for your next adventure."
        action={<Button onPress={() => router.navigate("/explore")}>Explore destinations</Button>} />
    </View>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  body: { flex: 1, justifyContent: "center" },
});
