import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTrip } from "@/state/store";
import { useDayRoute } from "@/lib/useDayRoute";
import { useTripSession } from "@/state/tripSession";
import { fmtDay, fmtDuration, fmtTime } from "@/domain/lib/format";
import { CATEGORY_LABEL } from "@/domain/logic/labels";
import { Button, TopBar } from "@/components/ui";
import { Icon } from "@/components/Icon";
import TripMap from "@/components/TripMap";
import { DaySelector, TripPlaceholder } from "@/components/trip";
import ActivityDetailSheet from "@/components/ActivityDetailSheet";
import { goBack } from "@/lib/back";
import { one } from "@/lib/params";
import { colors, font, space, touch } from "@/theme";

export default function MapScreen() {
  const params = useLocalSearchParams<{ id: string; day?: string; activity?: string }>();
  const id = one(params.id) ?? "";
  const routeDay = Number(one(params.day) ?? 0);
  const routeActivity = one(params.activity);
  const session = useTripSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [details, setDetails] = useState(false);
  const stripRef = useRef<ScrollView>(null);
  const chipX = useRef<Record<string, number>>({});
  const { trip, loading, error } = useTrip(id || undefined);

  useEffect(() => {
    if (session.tripId !== id) session.bind(id, Number.isFinite(routeDay) ? routeDay : 0);
    if (routeActivity) session.setActivity(routeActivity);
    // Bind once per trip open. Later day changes live in the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const dayIndex = Math.min(session.tripId === id ? session.day : routeDay, (trip?.days.length ?? 1) - 1);
  const route = useDayRoute(trip, dayIndex);
  const activityId = session.activityId;

  useEffect(() => {
    if (!activityId) return;
    const x = chipX.current[activityId];
    if (x != null) stripRef.current?.scrollTo({ x: Math.max(0, x - 16), animated: true });
  }, [activityId, dayIndex]);

  if (!trip) return <TripPlaceholder loading={loading} error={error} onBack={goBack} />;

  const day = trip.days[dayIndex];
  const acts = day.activities;
  const idx = acts.findIndex((a) => a.id === activityId);
  const sel = idx >= 0 ? acts[idx] : undefined;
  const selectDay = (i: number) => {
    session.setDay(i);
    router.setParams({ day: String(i), activity: "" });
  };
  const select = (activity?: string) => {
    session.setActivity(activity);
    router.setParams({ activity: activity ?? "" });
  };

  return (
    <View style={styles.screen}>
      <TopBar title={`Day ${day.index + 1} map`} subtitle={fmtDay(day.date)} onBack={goBack} />
      <DaySelector days={trip.days} selected={day.index} onSelect={selectDay} />
      <View style={styles.map}>
        <TripMap
          activities={acts}
          route={route}
          selectedId={activityId}
          onSelect={(next) => select(next === activityId ? undefined : next)}
          fill
        />
        {!sel ? <Text style={styles.hint}>Tap a numbered stop to see details</Text> : null}
      </View>
      <ScrollView
        ref={stripRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: sel ? 168 + insets.bottom : insets.bottom }}
        contentContainerStyle={styles.strip}
      >
        {acts.map((a, i) => (
          <Pressable
            key={a.id}
            onLayout={(e) => { chipX.current[a.id] = e.nativeEvent.layout.x; }}
            onPress={() => select(a.id)}
            style={[styles.chip, a.id === activityId && styles.chipOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: a.id === activityId }}
          >
            <Text style={[styles.chipNum, a.id === activityId && styles.chipNumOn]}>{i + 1}</Text>
            <Text style={styles.chipName} numberOfLines={1}>{a.name}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {sel ? (
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space[3] }]}>
          <View style={styles.sheetTop}>
            <Text style={styles.sheetNum}>{idx + 1}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetMeta}>{fmtTime(sel.startMin)} · {fmtDuration(sel.durationMin)} · {CATEGORY_LABEL[sel.category]}</Text>
              <Text style={styles.sheetName}>{sel.name}</Text>
            </View>
            <Pressable style={styles.icon} onPress={() => select(undefined)} accessibilityLabel="Clear selection">
              <Icon name="x" size={16} />
            </Pressable>
          </View>
          <View style={styles.actions}>
            <Pressable style={styles.icon} disabled={idx === 0} onPress={() => select(acts[idx - 1].id)} accessibilityLabel="Previous stop">
              <Icon name="back" size={18} color={idx === 0 ? "#b7bfba" : colors.ink} />
            </Pressable>
            <View style={{ flex: 1 }}><Button onPress={() => setDetails(true)}>View Details</Button></View>
            <Pressable style={styles.icon} disabled={idx === acts.length - 1} onPress={() => select(acts[idx + 1].id)} accessibilityLabel="Next stop">
              <Icon name="chevron" size={18} color={idx === acts.length - 1 ? "#b7bfba" : colors.ink} />
            </Pressable>
          </View>
        </View>
      ) : null}
      <ActivityDetailSheet activity={details ? sel ?? null : null} number={idx + 1} date={day.date} onClose={() => setDetails(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  map: { flex: 1, paddingHorizontal: space[4], paddingTop: space[3] },
  strip: { paddingHorizontal: space[4], paddingVertical: space[3], gap: space[2] },
  chip: { minHeight: touch, maxWidth: 220, flexDirection: "row", alignItems: "center", gap: 8, paddingRight: 14, paddingLeft: 8, borderRadius: 999, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.white },
  chipOn: { borderColor: colors.coral, backgroundColor: "#fdf0ec" },
  chipNum: { width: 24, height: 24, borderRadius: 12, overflow: "hidden", backgroundColor: colors.forest, color: colors.white, textAlign: "center", lineHeight: 24, fontFamily: font.bodyBold, fontSize: 12 },
  chipNumOn: { backgroundColor: colors.coral },
  chipName: { fontFamily: font.bodySemi, fontSize: 14, color: colors.ink, flexShrink: 1 },
  hint: { position: "absolute", alignSelf: "center", bottom: 12, backgroundColor: "rgba(21,34,30,0.82)", color: colors.white, borderRadius: 999, overflow: "hidden", paddingVertical: 8, paddingHorizontal: 14, fontFamily: font.body, fontSize: 13 },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: colors.paper, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: space[4], gap: space[3], shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 16, elevation: 8 },
  sheetTop: { flexDirection: "row", alignItems: "center", gap: space[3] },
  sheetNum: { width: 32, height: 32, borderRadius: 16, overflow: "hidden", backgroundColor: colors.coral, color: colors.white, textAlign: "center", lineHeight: 32, fontFamily: font.bodyBold },
  sheetMeta: { color: colors.muted, fontFamily: font.body, fontSize: 13 },
  sheetName: { fontFamily: font.displaySemi, fontSize: 18, color: colors.ink },
  actions: { flexDirection: "row", alignItems: "center", gap: space[2] },
  icon: { width: touch, height: touch, borderRadius: touch / 2, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center", backgroundColor: colors.white },
});
