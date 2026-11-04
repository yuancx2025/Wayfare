import { useRef } from "react";
import { ActivityIndicator, Pressable, StyleSheet } from "react-native";
import { useStore } from "@/state/store";
import { Icon } from "./Icon";
import { colors } from "@/theme";

/** Shared card/detail action. Only confirmed persistence changes the heart. */
export function FavoriteButton({ trip }: { trip: { id: string; destination: string; isFavorite: boolean } }) {
  const { favoritePending, setTripFavorite, showToast } = useStore();
  const active = useRef(false);
  const busy = Boolean(favoritePending[trip.id]);
  const save = async () => {
    if (busy || active.current) return;
    active.current = true;
    const next = !trip.isFavorite;
    try {
      await setTripFavorite(trip.id, next);
      showToast(next ? "Added to Favorite trips" : "Removed from Favorite trips");
    } catch {
      showToast("Couldn't save favorite. Try again.");
    } finally {
      active.current = false;
    }
  };
  return (
    <Pressable
      onPress={() => { void save(); }}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={busy ? `Saving ${trip.destination} favorite` : `${trip.isFavorite ? "Remove" : "Add"} ${trip.destination} ${trip.isFavorite ? "from" : "to"} favorites`}
      accessibilityHint="Find favorite trips in Profile"
      accessibilityState={{ selected: trip.isFavorite, disabled: busy, busy }}
      style={({ pressed }) => [styles.button, trip.isFavorite && styles.saved, pressed && !busy && styles.pressed]}
    >
      {busy ? <ActivityIndicator size="small" color={colors.forest} /> : <Icon name={trip.isFavorite ? "heart" : "heart-outline"} color={colors.forest} size={24} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  saved: { backgroundColor: colors.mint },
  pressed: { opacity: 0.7 },
});
