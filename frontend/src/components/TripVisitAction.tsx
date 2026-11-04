import { useRef } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useStore } from "@/state/store";
import { Icon } from "./Icon";
import { colors, font, space } from "@/theme";

/** Explicit confirmation only. Travel dates never change this status. */
export function TripVisitAction({ trip, onSaved }: {
  trip: { id: string; destination: string; visited: boolean };
  onSaved: () => void;
}) {
  const { tripMetadataPending, setTripVisited, showToast } = useStore();
  const active = useRef(false);
  const busy = Boolean(tripMetadataPending[trip.id]);
  const save = async () => {
    if (busy || active.current) return;
    active.current = true;
    try {
      await setTripVisited(trip.id, !trip.visited);
      showToast(trip.visited ? "Removed visited status" : "Marked as visited");
      onSaved();
    } catch {
      showToast("Couldn't save visited status. Try again.");
    } finally {
      active.current = false;
    }
  };
  return <View>
    <Pressable
      onPress={() => { void save(); }}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={trip.visited ? `Remove visited status for ${trip.destination}` : `Mark ${trip.destination} as visited`}
      accessibilityState={{ selected: trip.visited, disabled: busy, busy }}
      style={({ pressed }) => [styles.row, pressed && !busy && styles.pressed]}
    >
      {busy ? <ActivityIndicator size="small" color={colors.forest} /> : <Icon name="check" color={trip.visited ? colors.forest : colors.ink} />}
      <Text style={styles.label}>{busy ? "Saving trip changes…" : trip.visited ? "Remove visited status" : "Mark as visited"}</Text>
    </Pressable>
    <Text style={styles.note}>Only you mark a trip as visited. Travel dates do not change this status.</Text>
  </View>;
}

const styles = StyleSheet.create({
  row: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: space[3], borderBottomWidth: 1, borderBottomColor: colors.line },
  label: { fontFamily: font.bodySemi, fontSize: 16, color: colors.ink },
  note: { fontFamily: font.body, fontSize: 12, lineHeight: 18, color: colors.muted, paddingVertical: space[3] },
  pressed: { opacity: 0.7 },
});
