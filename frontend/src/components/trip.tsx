import { useEffect, useRef } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import type { Activity, Day, Leg, Preferences, TripSummary } from "@/domain/types";
import { fmtDayNum, fmtDuration, fmtRange, fmtTime, fmtWeekday, plural } from "@/domain/lib/format";
import { statusLabel } from "@/domain/logic/tripHistory";
import { CATEGORY_LABEL, budgetLabel, foodLabel, interestLabel, paceLabel, transportLabel } from "@/domain/logic/labels";
import { Icon, type IconName } from "./Icon";
import { Button, EmptyState, Spinner } from "./ui";
import { useApi } from "@/lib/api";
import { colors, font, radius, space } from "@/theme";

export function tripStatus(trip: { startDate: string; endDate: string }, today: string) {
  return statusLabel(trip, today);
}

export function TripCard({ trip, today, onPress }: { trip: TripSummary; today: string; onPress: () => void }) {
  const api = useApi();
  return (
    <Pressable style={styles.card} onPress={onPress} accessibilityRole="button" accessibilityLabel={`Open ${trip.destination} trip`}>
      <Image source={{ uri: api.imageUrl(trip.image) }} style={StyleSheet.absoluteFill} contentFit="cover" />
      <LinearGradient colors={["rgba(0,0,0,0.05)", "rgba(6,24,19,0.84)"]} style={StyleSheet.absoluteFill} />
      <View style={styles.badges}>
        <Text style={styles.badgeLight}>{tripStatus(trip, today)}</Text>
        <Text style={styles.badgeForest}>{trip.adjusted ? "Adjusted" : "Itinerary ready"}</Text>
      </View>
      <View style={styles.cardCopy}>
        <Text style={styles.cardMeta}>{fmtRange(trip.startDate, trip.endDate)} · {plural(trip.dayCount, "day")}</Text>
        <Text style={styles.cardTitle}>{trip.destination}, {trip.country}</Text>
        <Text style={styles.cardFoot}>{plural(trip.travelers, "traveler")} · {trip.stopCount} stops planned</Text>
      </View>
    </Pressable>
  );
}

export function TripHistoryRow({ trip, today, onPress }: { trip: TripSummary; today: string; onPress: () => void }) {
  const api = useApi();
  return (
    <Pressable style={styles.historyRow} onPress={onPress} accessibilityRole="button" accessibilityLabel={`Open ${trip.destination} trip`}>
      <Image source={{ uri: api.imageUrl(trip.image) }} style={styles.historyImage} contentFit="cover" />
      <View style={styles.historyCopy}>
        <Text style={styles.historyStatus}>{tripStatus(trip, today)}</Text>
        <Text style={styles.historyTitle} numberOfLines={1}>{trip.destination}</Text>
        <Text style={styles.historyMeta} numberOfLines={1}>{fmtRange(trip.startDate, trip.endDate)} · {plural(trip.dayCount, "day")}</Text>
      </View>
      <Icon name="chevron" size={18} color={colors.muted} />
    </Pressable>
  );
}

/** Shown while a trip loads, or when it can't be found. */
export function TripPlaceholder({ loading, error, onBack }: { loading: boolean; error?: string; onBack?: () => void }) {
  return (
    <View style={styles.placeholder}>
      {loading ? <Spinner label="Loading your trip" /> : (
        <EmptyState
          icon="map"
          title="Trip not found"
          body={error ?? "It may have been deleted."}
          action={onBack ? <Button onPress={onBack}>Back to trips</Button> : undefined}
        />
      )}
    </View>
  );
}

export function DaySelector({ days, selected, onSelect }: { days: Day[]; selected: number; onSelect: (i: number) => void }) {
  const ref = useRef<ScrollView>(null);
  const xs = useRef<Record<number, number>>({});
  useEffect(() => {
    const x = xs.current[selected];
    if (x != null) ref.current?.scrollTo({ x: Math.max(0, x - space[4]), animated: true });
  }, [selected]);
  return (
    <ScrollView ref={ref} horizontal style={{ flexGrow: 0 }} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRow} accessibilityRole="tablist">
      {days.map((d) => {
        const on = selected === d.index;
        return (
          <Pressable
            key={d.index}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onLayout={(e) => { xs.current[d.index] = e.nativeEvent.layout.x; }}
            onPress={() => onSelect(d.index)}
            style={[styles.dayPill, on && styles.dayPillOn]}
          >
            <Text style={[styles.dayKicker, on && styles.dayOnText]}>Day {d.index + 1}</Text>
            <Text style={[styles.dayNum, on && styles.dayOnText]}>{fmtDayNum(d.date)}</Text>
            <Text style={[styles.dayWeek, on && styles.dayOnMuted]}>{fmtWeekday(d.date)}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const CAT_ICON: Record<Activity["category"], IconName> = {
  food: "utensils", culture: "star", nature: "leaf", museums: "spark", shopping: "wallet", architecture: "compass", nightlife: "heart",
};

const CAT_COLOR: Record<Activity["category"], { color: string; bg: string }> = {
  food: { color: "#8e3b28", bg: "#fbe4dc" },
  culture: { color: colors.forest, bg: colors.mint },
  nature: { color: "#2f5f22", bg: "#e3efd6" },
  museums: { color: "#3d4a73", bg: "#e4e8f5" },
  architecture: { color: "#3d4a73", bg: "#e4e8f5" },
  shopping: { color: "#7a5413", bg: "#f8ebd2" },
  nightlife: { color: "#5b2f6a", bg: "#efe2f3" },
};

export function ActivityCard({ activity, number, onPress, highlighted }: { activity: Activity; number: number; onPress: () => void; highlighted?: boolean }) {
  const cat = CAT_COLOR[activity.category];
  return (
    <View style={styles.timelineItem}>
      <View style={styles.rail}><Text style={[styles.stop, highlighted && styles.stopOn]}>{number}</Text></View>
      <Pressable onPress={onPress} style={[styles.activity, highlighted && styles.activityOn]} accessibilityRole="button">
        <View style={styles.metaRow}>
          <Text style={styles.time}>{fmtTime(activity.startMin)}</Text>
          <Text style={styles.dot}>·</Text>
          <Text style={styles.meta}>{fmtDuration(activity.durationMin)}</Text>
          <View style={[styles.cat, { backgroundColor: cat.bg }]}>
            <Icon name={CAT_ICON[activity.category]} size={12} color={cat.color} />
            <Text style={[styles.catText, { color: cat.color }]}>{CATEGORY_LABEL[activity.category]}</Text>
          </View>
        </View>
        <Text style={styles.activityName}>{activity.name}</Text>
        <Text style={styles.area}>{activity.area}</Text>
        <Text style={styles.desc}>{activity.description}</Text>
        <View style={styles.why}>
          <Icon name="spark" size={14} color="#b07d2c" />
          <Text style={styles.whyText}><Text style={styles.whyLabel}>Why this fits you{"\n"}</Text>{activity.why}</Text>
        </View>
      </Pressable>
    </View>
  );
}

const LEG_ICON: Record<Leg["mode"], IconName> = { walk: "walk", transit: "train", drive: "car" };
const LEG_WORD: Record<Leg["mode"], string> = { walk: "walk", transit: "by transit", drive: "drive" };

export function TransportLeg({ leg, freeMin }: { leg: Leg; freeMin: number }) {
  return (
    <View style={styles.leg}>
      <View style={styles.rail}><View style={styles.legLine} /></View>
      <View style={styles.legBody}>
        <View style={styles.legChip}>
          <Icon name={LEG_ICON[leg.mode]} size={15} color="#3f4a45" />
          <Text style={styles.legText}>~{leg.minutes} min {LEG_WORD[leg.mode]} · {leg.km} km</Text>
        </View>
        {leg.source === "google" ? null : <Text style={styles.legEst}>estimate</Text>}
        {freeMin >= 20 ? <Text style={styles.legFree}>+ {fmtDuration(freeMin)} free time</Text> : null}
      </View>
    </View>
  );
}

export function freeTimeBefore(acts: Activity[], i: number) {
  const prev = acts[i - 1], a = acts[i];
  if (!prev || !a.legIn) return 0;
  return a.startMin - (prev.startMin + prev.durationMin + a.legIn.minutes);
}

export function PrefsSummary({ prefs, compact = false }: { prefs: Preferences; compact?: boolean }) {
  const items = [
    { icon: "clock" as const, text: `${paceLabel(prefs.pace)} pace` },
    { icon: transportIcon(prefs.transport), text: transportLabel(prefs.transport) },
    { icon: "wallet" as const, text: budgetLabel(prefs.budget) },
    ...prefs.interests.slice(0, compact ? 3 : 7).map((i) => ({ icon: "heart" as const, text: interestLabel(i) })),
    ...(compact ? [] : prefs.food.map((f) => ({ icon: "utensils" as const, text: foodLabel(f) }))),
  ];
  return (
    <View style={styles.pills}>
      {items.map((it) => (
        <View key={it.text} style={styles.pill}>
          <Icon name={it.icon} size={13} color={colors.forest} />
          <Text style={styles.pillText}>{it.text}</Text>
        </View>
      ))}
    </View>
  );
}

const transportIcon = (t: Preferences["transport"]): IconName => (t === "walking" ? "walk" : t === "driving" ? "car" : "train");

const styles = StyleSheet.create({
  placeholder: { flex: 1, justifyContent: "center", backgroundColor: colors.paper },
  card: { height: 236, borderRadius: radius.xl, overflow: "hidden", backgroundColor: colors.ink },
  badges: { position: "absolute", top: 14, left: 14, right: 14, flexDirection: "row", justifyContent: "space-between" },
  badgeLight: { backgroundColor: "rgba(255,254,250,0.92)", color: colors.ink, borderRadius: 999, overflow: "hidden", paddingVertical: 7, paddingHorizontal: 11, fontFamily: font.bodyBold, fontSize: 12 },
  badgeForest: { backgroundColor: "rgba(22,75,59,0.86)", color: colors.white, borderRadius: 999, overflow: "hidden", paddingVertical: 7, paddingHorizontal: 11, fontFamily: font.bodyBold, fontSize: 12 },
  cardCopy: { position: "absolute", left: 18, right: 18, bottom: 18 },
  cardMeta: { color: "rgba(255,255,255,0.82)", fontFamily: font.bodyBold, fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase" },
  cardTitle: { marginTop: 4, color: colors.white, fontFamily: font.display, fontSize: 26 },
  cardFoot: { marginTop: 6, color: "rgba(255,255,255,0.92)", fontFamily: font.body, fontSize: 13 },
  historyRow: { minHeight: 88, flexDirection: "row", alignItems: "center", gap: space[3], padding: space[3], borderRadius: radius.lg, backgroundColor: colors.cream },
  historyImage: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: colors.ink },
  historyCopy: { flex: 1, gap: 2 },
  historyStatus: { color: colors.forest, fontFamily: font.bodyBold, fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase" },
  historyTitle: { color: colors.ink, fontFamily: font.displaySemi, fontSize: 16 },
  historyMeta: { color: colors.muted, fontFamily: font.body, fontSize: 13 },
  dayRow: { paddingHorizontal: space[5], paddingVertical: space[2], gap: space[2] },
  dayPill: { minWidth: 62, minHeight: 68, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.white, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  dayPillOn: { backgroundColor: colors.forest, borderColor: colors.forest },
  dayKicker: { color: colors.muted, fontFamily: font.bodyBold, fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase" },
  dayNum: { fontFamily: font.display, fontSize: 18, color: colors.ink },
  dayWeek: { color: colors.muted, fontFamily: font.body, fontSize: 11 },
  dayOnText: { color: colors.white },
  dayOnMuted: { color: "rgba(255,255,255,0.75)" },
  timelineItem: { flexDirection: "row", gap: space[2] },
  rail: { width: 36, alignItems: "center" },
  stop: { marginTop: space[4], width: 32, height: 32, borderRadius: 16, overflow: "hidden", backgroundColor: colors.forest, color: colors.white, textAlign: "center", lineHeight: 32, fontFamily: font.bodyBold, fontSize: 13 },
  stopOn: { backgroundColor: colors.coral },
  activity: { flex: 1, flexShrink: 1, padding: space[4], borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.white, gap: 6 },
  activityOn: { borderColor: colors.coral },
  metaRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  time: { color: colors.ink, fontFamily: font.bodyBold, fontSize: 13 },
  meta: { color: colors.muted, fontFamily: font.body, fontSize: 13 },
  dot: { color: colors.muted },
  cat: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 8 },
  catText: { fontFamily: font.bodyBold, fontSize: 11 },
  activityName: { fontFamily: font.displaySemi, fontSize: 17, color: colors.ink },
  area: { color: colors.muted, fontFamily: font.body, fontSize: 13 },
  desc: { color: "#3f4a45", fontFamily: font.body, fontSize: 14, lineHeight: 20 },
  why: { flexDirection: "row", gap: 8, marginTop: 2, padding: 10, borderRadius: radius.sm, backgroundColor: "#f0f6f2" },
  whyText: { flex: 1, flexShrink: 1, color: colors.forest, fontFamily: font.body, fontSize: 13, lineHeight: 18 },
  whyLabel: { fontFamily: font.bodyBold, fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase" },
  leg: { minHeight: 56, flexDirection: "row", gap: space[2] },
  legLine: { width: 0, flex: 1, borderLeftWidth: 2, borderStyle: "dashed", borderColor: "#c5ccc7" },
  legBody: { flex: 1, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, paddingVertical: space[2] },
  legChip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.cream, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10 },
  legText: { color: "#3f4a45", fontFamily: font.bodySemi, fontSize: 13 },
  legEst: { color: colors.muted, fontFamily: font.body, fontSize: 12, fontStyle: "italic" },
  legFree: { color: "#8a6420", fontFamily: font.bodySemi, fontSize: 12 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.mint, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10 },
  pillText: { color: colors.forest, fontFamily: font.bodySemi, fontSize: 13 },
});
