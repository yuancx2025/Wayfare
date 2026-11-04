import { useEffect, useRef } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import type { SavedPlaceReference } from "@/domain/types";
import { usePlaceSave } from "@/lib/savedPlaces";
import { useStore } from "@/state/store";
import { Icon } from "./Icon";
import { colors, font, radius } from "@/theme";

export function SavePlaceButton({ reference, name, full = false, onRemoved }: {
  reference: SavedPlaceReference; name: string; full?: boolean; onRemoved?: () => void;
}) {
  const { collection, entry, pending, setSaved } = usePlaceSave(reference);
  const { showToast } = useStore();
  const active = useRef(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const unknown = collection.data === undefined;
  const retry = unknown && collection.isError;
  const busy = pending || (unknown && collection.isPending);
  const label = retry ? "Retry saved places" : pending ? "Saving…" : busy ? "Loading Saved…" : entry ? "Remove from Saved" : "Save place";
  const press = async () => {
    if (active.current || busy) return;
    if (retry) { await collection.refetch(); return; }
    active.current = true;
    const next = !entry;
    try {
      await setSaved(next);
      showToast(next ? "Added to Saved places" : "Removed from Saved places");
      if (!next && mounted.current) onRemoved?.();
    } catch { showToast("Couldn't update Saved. Try again."); }
    finally { active.current = false; }
  };
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={retry ? label : `${entry ? "Remove" : "Save"} ${name}${entry ? " from Saved" : " to Saved"}`}
    accessibilityHint={retry ? "Reload your collection before saving" : "Find saved places in the Saved tab"}
    accessibilityState={{ selected: Boolean(entry), busy, disabled: busy }}
    disabled={busy}
    onPress={() => { void press(); }}
    style={({ pressed }) => [styles.button, full ? styles.full : styles.icon, entry && styles.saved, pressed && !busy && styles.pressed]}
  >
    {busy ? <ActivityIndicator size="small" color={colors.forest} /> : <Icon name={retry ? "refresh" : entry ? "bookmark-filled" : "bookmark"} color={colors.forest} size={full ? 20 : 24} />}
    {full ? <Text style={styles.label}>{label}</Text> : null}
  </Pressable>;
}

const styles = StyleSheet.create({
  button: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  icon: { width: 44, height: 44, borderRadius: 22 },
  full: { minHeight: 48, paddingHorizontal: 22, borderRadius: radius.md, alignSelf: "stretch" },
  saved: { backgroundColor: colors.mint },
  pressed: { opacity: 0.7 },
  label: { fontFamily: font.bodyBold, fontSize: 15, color: colors.forest },
});
