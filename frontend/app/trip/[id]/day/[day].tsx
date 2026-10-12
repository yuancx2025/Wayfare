import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useStore, useTrip } from "@/state/store";
import { useDayRoute } from "@/lib/useDayRoute";
import { useTripSession } from "@/state/tripSession";
import { fmtDay, fmtDuration, fmtTime, plural } from "@/domain/lib/format";
import { transportLabel } from "@/domain/logic/labels";
import { Button, TopBar } from "@/components/ui";
import { Icon } from "@/components/Icon";
import TripMap from "@/components/TripMap";
import { ActivityCard, DaySelector, TransportLeg, TripPlaceholder, freeTimeBefore } from "@/components/trip";
import ActivityDetailSheet from "@/components/ActivityDetailSheet";
import AdjustDaySheet from "@/components/AdjustDaySheet";
import { goBack } from "@/lib/back";
import { one } from "@/lib/params";
import { colors, font, radius, space } from "@/theme";

export default function Daily() {
  const params = useLocalSearchParams<{ id: string; day: string }>();
  const id = one(params.id) ?? "";
  const routeDay = Number(one(params.day) ?? 0);
  const { putTrip, showToast } = useStore();
  const session = useTripSession();
  const router = useRouter();
  const { trip, loading, error } = useTrip(id || undefined);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const offsets = useRef<Record<string, number>>({});
  const listY = useRef(0);

  useEffect(() => {
    if (session.tripId !== id) session.bind(id, Number.isFinite(routeDay) ? routeDay : 0);
  }, [id, routeDay, session]);

  const dayIndex = Math.min(session.tripId === id ? session.day : routeDay, (trip?.days.length ?? 1) - 1);
  const route = useDayRoute(trip, dayIndex);

  useEffect(() => {
    const focus = session.activityId;
    if (!focus) return;
    const y = offsets.current[focus];
    if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 24), animated: true });
  }, [session.activityId, dayIndex]);

  if (!trip) return <TripPlaceholder loading={loading} error={error} onBack={goBack} />;

  const day = trip.days[dayIndex];
  const acts = day.activities;
  const open = acts.find((a) => a.id === openId) ?? null;
  const last = acts[acts.length - 1];
  const travel = acts.reduce((s, a) => s + (a.legIn?.minutes ?? 0), 0);
  const selectDay = (i: number) => {
    session.setDay(i);
    router.setParams({ day: String(i) });
  };
  const toMap = (activityId?: string) => {
    if (activityId) session.setActivity(activityId);
    router.push({ pathname: "/trip/[id]/map", params: { id, day: String(day.index), ...(activityId ? { activity: activityId } : {}) } });
  };

  return (
    <View style={styles.screen}>
      <TopBar title="Daily itinerary" subtitle={`${trip.destination} · ${plural(trip.days.length, "day")}`} onBack={goBack} />
      <DaySelector days={trip.days} selected={day.index} onSelect={selectDay} />
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>{fmtDay(day.date)} · {day.areas}</Text>
        <Text style={styles.title}>{day.theme}</Text>
        <View style={styles.facts}>
          <Text style={styles.fact}>{acts.length ? `${fmtTime(acts[0].startMin)} – ${fmtTime(last.startMin + last.durationMin)}` : "Open day"}</Text>
          <Text style={styles.fact}>{plural(acts.length, "stop")}</Text>
          <Text style={styles.fact}>~{fmtDuration(travel)} travel · {transportLabel(trip.prefs.transport)}</Text>
        </View>
        <View style={styles.mapCard}>
          <TripMap activities={acts} route={route} selectedId={session.activityId} height={170} interactive={false} />
          <View style={styles.mapActions}>
            <View style={{ flex: 1 }}><Button variant="secondary" icon="map" onPress={() => toMap(session.activityId)}>Full map</Button></View>
            <View style={{ flex: 1 }}><Button variant="secondary" icon="sliders" onPress={() => setAdjusting(true)}>Adjust Day</Button></View>
          </View>
        </View>
        <View style={{ marginTop: space[5], gap: space[2] }} onLayout={(e) => { listY.current = e.nativeEvent.layout.y; }}>
          {acts.map((a, i) => (
            <View key={a.id} onLayout={(e) => { offsets.current[a.id] = listY.current + e.nativeEvent.layout.y; }}>
              {a.legIn ? <TransportLeg leg={a.legIn} freeMin={freeTimeBefore(acts, i)} /> : null}
              <ActivityCard
                activity={a}
                number={i + 1}
                highlighted={a.id === session.activityId}
                onPress={() => { setOpenId(a.id); session.setActivity(a.id); }}
              />
            </View>
          ))}
        </View>
        <Text style={styles.fine}>
          {acts.some((a) => a.legIn?.source === "google") ? "Travel times come from Google." : "Times and travel are estimates."} Check opening hours before you go.
        </Text>
      </ScrollView>
      <ActivityDetailSheet
        activity={open}
        number={open ? acts.indexOf(open) + 1 : 0}
        date={day.date}
        onClose={() => setOpenId(null)}
        onShowMap={() => { const current = openId; setOpenId(null); if (current) toMap(current); }}
      />
      <AdjustDaySheet
        open={adjusting}
        trip={trip}
        dayIndex={day.index}
        onClose={() => setAdjusting(false)}
        onApplied={(updated, newId) => {
          putTrip(updated);
          setAdjusting(false);
          if (newId) session.setActivity(newId);
          showToast(`Day ${day.index + 1} updated`);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: space[5], paddingBottom: space[6] },
  eyebrow: { color: colors.muted, fontFamily: font.bodyBold, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" },
  title: { marginTop: 4, marginBottom: space[3], fontFamily: font.display, fontSize: 26, color: colors.ink },
  facts: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  fact: { color: colors.muted, fontFamily: font.body, fontSize: 13 },
  mapCard: { marginTop: space[4], padding: 6, borderWidth: 1, borderColor: colors.line, borderRadius: radius.xl, backgroundColor: colors.white, gap: 6 },
  mapActions: { flexDirection: "row", gap: 6 },
  fine: { marginTop: space[4], textAlign: "center", color: colors.muted, fontFamily: font.body, fontSize: 12, lineHeight: 18 },
});
