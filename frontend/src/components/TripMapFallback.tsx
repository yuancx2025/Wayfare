import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Activity, DayRoute } from "@/domain/types";
import { colors, font, radius } from "@/theme";

export interface TripMapProps {
  activities: Activity[];
  /** Road/transit geometry from the backend; without it stops are joined in visit order. */
  route?: DayRoute | null;
  selectedId?: string;
  onSelect?: (id: string) => void;
  height?: number;
  fill?: boolean;
  interactive?: boolean;
  label?: (i: number) => string;
  showOrder?: boolean;
}

/** Stop list shown where no native map can render (web, or a build without the maps module). */
export default function TripMapFallback({ activities, selectedId, onSelect, height = 220, fill = false, interactive = true, label = (i) => String(i + 1) }: TripMapProps) {
  return (
    <View style={[styles.fallback, fill ? styles.fill : { minHeight: height }]}>
      <Text style={styles.title}>Map unavailable</Text>
      {activities.map((a, i) => (
        <Pressable
          key={a.id}
          disabled={!interactive || !onSelect}
          onPress={() => onSelect?.(a.id)}
          accessibilityRole={interactive && onSelect ? "button" : undefined}
        >
          <Text style={[styles.stop, a.id === selectedId && styles.stopOn]}>{label(i)}. {a.name}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { borderRadius: radius.lg, backgroundColor: colors.cream, padding: 16, justifyContent: "center", gap: 4 },
  fill: { flex: 1 },
  title: { fontFamily: font.bodyBold, color: colors.ink, marginBottom: 4 },
  stop: { fontFamily: font.body, color: colors.muted, fontSize: 13, lineHeight: 22 },
  stopOn: { color: colors.coralInk, fontFamily: font.bodyBold },
});
