import { useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore, useTrip } from "@/state/store";
import { useApi } from "@/lib/api";
import { useTripSession } from "@/state/tripSession";
import { fmtDay, fmtRange, plural } from "@/domain/lib/format";
import { useToday } from "@/lib/useToday";
import { BottomSheet, Button, SectionHeading } from "@/components/ui";
import { Icon } from "@/components/Icon";
import TripMap from "@/components/TripMap";
import { PrefsSummary, TripPlaceholder, tripStatus } from "@/components/trip";
import { colors, font, radius, space, touch } from "@/theme";
import { goBack } from "@/lib/back";
import { useCalendarExport } from "@/lib/useCalendarExport";
import { CalendarSheet } from "@/components/CalendarSheet";
import { one } from "@/lib/params";

type MenuFollowUp = "calendar" | "delete" | "removeEvents";

export default function Overview() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = one(raw) ?? "";
  const api = useApi();
  const { deleteTrip, showToast } = useStore();
  const session = useTripSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [menu, setMenu] = useState(false);
  const today = useToday();
  const { trip, loading, error } = useTrip(id || undefined);
  const calendar = useCalendarExport(trip, today);
  const [calendarSheet, setCalendarSheet] = useState(false);
  // iOS cannot present a modal while the menu is still sliding away, so the next one waits for onDismiss.
  const [afterMenu, setAfterMenu] = useState<MenuFollowUp | null>(null);

  if (!trip) return <TripPlaceholder loading={loading} error={error} onBack={goBack} />;

  const openMenu = () => {
    setMenu(true);
    // The itinerary may have changed on another screen since the last check.
    calendar.refresh();
  };

  const closeMenuThen = (next: MenuFollowUp) => {
    setMenu(false);
    if (Platform.OS === "ios") setAfterMenu(next);
    else runAfterMenu(next);
  };

  const runAfterMenu = (next: MenuFollowUp | null) => {
    setAfterMenu(null);
    if (next === "calendar") setCalendarSheet(true);
    if (next === "delete") confirmDelete();
    if (next === "removeEvents") confirmRemoveFromCalendar();
  };

  const remove = async (withCalendarEvents: boolean) => {
    let calendarFailed = false;
    if (withCalendarEvents) {
      try {
        await calendar.remove();
      } catch {
        calendarFailed = true;
      }
    }
    try {
      await deleteTrip(id);
      router.dismissAll();
      showToast(calendarFailed ? `${trip.destination} trip deleted; its calendar events couldn't be removed` : `${trip.destination} trip deleted`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Couldn't delete this trip");
    }
  };

  const confirmDelete = () => {
    if (!calendar.exported) {
      Alert.alert("Delete this trip?", `Your ${trip.destination} itinerary will be removed. This can't be undone.`, [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => { void remove(false); } },
      ]);
      return;
    }
    Alert.alert("Delete this trip?", "This can't be undone. Its activities are also in your Wayfare calendar.", [
      { text: "Cancel", style: "cancel" },
      { text: "Keep events", onPress: () => { void remove(false); } },
      { text: "Delete events too", style: "destructive", onPress: () => { void remove(true); } },
    ]);
  };

  const confirmRemoveFromCalendar = () => {
    Alert.alert("Remove from calendar?", `This trip's events will be deleted from your Wayfare calendar. You can add them again later.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => { void removeFromCalendar(); } },
    ]);
  };

  const removeFromCalendar = async () => {
    try {
      showToast(`Removed ${plural(await calendar.remove(), "event")} from your calendar`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Couldn't remove the calendar events");
    }
  };

  const allStops = trip.days.flatMap((d) => d.activities.map((a) => ({ a, day: d.index })));
  const openDay = (day: number) => {
    session.bind(id, day);
    router.push(`/trip/${id}/day/${day}`);
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={[styles.hero, { height: 300 + insets.top }]}>
          <Image source={{ uri: api.imageUrl(trip.image) }} style={StyleSheet.absoluteFill} contentFit="cover" />
          <LinearGradient colors={["rgba(0,0,0,0.05)", "rgba(6,24,19,0.84)"]} style={StyleSheet.absoluteFill} />
          <View style={[styles.heroBar, { top: insets.top + space[3] }]}>
            <Pressable style={styles.glass} onPress={goBack} accessibilityLabel="Back to trips"><Icon name="back" color={colors.white} /></Pressable>
            <Pressable style={styles.glass} onPress={openMenu} accessibilityLabel="Trip options"><Icon name="more" color={colors.white} /></Pressable>
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.status}>{tripStatus(trip, today)}</Text>
            <Text style={styles.heroTitle}>{trip.destination}</Text>
            <Text style={styles.heroDates}>{fmtRange(trip.startDate, trip.endDate)}</Text>
          </View>
        </View>
        <View style={styles.stats}>
          <Stat n={String(trip.days.length)} label="days" />
          <Stat n={String(allStops.length)} label="stops" />
          <Stat n={String(trip.travelers)} label={trip.travelers === 1 ? "traveler" : "travelers"} />
        </View>
        <View style={styles.section}>
          <SectionHeading eyebrow="Planned around" title="Your preferences" />
          <PrefsSummary prefs={trip.prefs} />
        </View>
        <View style={styles.section}>
          <SectionHeading eyebrow="At a glance" title="Day by day" />
          <View style={{ gap: space[2] }}>
            {trip.days.map((d) => (
              <Pressable key={d.index} style={styles.dayCard} onPress={() => openDay(d.index)}>
                <View style={styles.dayNum}><Text style={styles.dayKicker}>Day</Text><Text style={styles.dayN}>{d.index + 1}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.dayMeta}>{fmtDay(d.date)} · {d.areas}</Text>
                  <Text style={styles.dayTheme}>{d.theme}</Text>
                  <Text style={styles.dayHighlights} numberOfLines={2}>
                    {d.activities.filter((a) => a.category !== "food").slice(0, 3).map((a) => a.name).join(" · ") || d.activities.map((a) => a.name).join(" · ")}
                  </Text>
                </View>
                <Text style={styles.dayCount}>{plural(d.activities.length, "stop")}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={styles.section}>
          <SectionHeading
            eyebrow="Where you'll be"
            title="Trip map"
            action={<Pressable onPress={() => { session.bind(id, 0); router.push(`/trip/${id}/map`); }}><Text style={styles.link}>Open map</Text></Pressable>}
          />
          <Pressable onPress={() => { session.bind(id, 0); router.push(`/trip/${id}/map`); }} accessibilityLabel="Open trip map">
            <TripMap activities={allStops.map((s) => s.a)} interactive={false} showOrder={false} label={(i) => String(allStops[i].day + 1)} height={200} />
          </Pressable>
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <Button trailing="arrow" onPress={() => openDay(0)}>Open Daily Itinerary</Button>
      </View>
      <BottomSheet open={menu} onClose={() => setMenu(false)} onDismiss={() => runAfterMenu(afterMenu)} title="Trip options">
        <Pressable style={styles.menuRow} onPress={() => { setMenu(false); session.bind(id, 0); router.push(`/trip/${id}/map`); }}>
          <Icon name="map" color={colors.ink} /><Text style={styles.menuText}>View map</Text>
        </Pressable>
        {calendar.canExport && calendar.status === "none" && (
          <Pressable style={styles.menuRow} onPress={() => closeMenuThen("calendar")} accessibilityRole="button">
            <Icon name="calendar" color={colors.ink} /><Text style={styles.menuText}>Add to calendar</Text>
          </Pressable>
        )}
        {calendar.canExport && calendar.status === "stale" && (
          <Pressable style={styles.menuRow} onPress={() => closeMenuThen("calendar")} accessibilityRole="button" accessibilityHint="Your itinerary changed since you added it to your calendar">
            <Icon name="refresh" color={colors.ink} />
            <View style={{ flex: 1 }}>
              <Text style={styles.menuText}>Update calendar</Text>
              <Text style={styles.menuHint}>Your itinerary changed since you added it</Text>
            </View>
          </Pressable>
        )}
        {calendar.canExport && calendar.status === "synced" && (
          <View style={styles.menuRow} accessible accessibilityLabel="Calendar is up to date">
            <Icon name="check" color={colors.forest} /><Text style={[styles.menuText, { color: colors.forest }]}>Calendar is up to date</Text>
          </View>
        )}
        {calendar.supported && calendar.exported && (
          <Pressable style={styles.menuRow} onPress={() => closeMenuThen("removeEvents")} disabled={calendar.busy} accessibilityRole="button">
            <Icon name="x" color={colors.ink} /><Text style={styles.menuText}>Remove from calendar</Text>
          </Pressable>
        )}
        <Pressable style={styles.menuRow} onPress={() => closeMenuThen("delete")} accessibilityRole="button">
          <Icon name="trash" color={colors.coralInk} /><Text style={[styles.menuText, { color: colors.coralInk }]}>Delete trip</Text>
        </Pressable>
      </BottomSheet>
      <CalendarSheet open={calendarSheet} onClose={() => setCalendarSheet(false)} trip={trip} calendar={calendar} onToast={showToast} />
    </View>
  );
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statN}>{n}</Text>
      <Text style={styles.statL}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  hero: { justifyContent: "flex-end" },
  heroBar: { position: "absolute", left: space[4], right: space[4], flexDirection: "row", justifyContent: "space-between" },
  glass: { width: touch, height: touch, borderRadius: touch / 2, backgroundColor: "rgba(15,30,25,0.38)", alignItems: "center", justifyContent: "center" },
  heroCopy: { padding: space[5], paddingBottom: 44 },
  status: { alignSelf: "flex-start", backgroundColor: "rgba(255,254,250,0.92)", color: colors.ink, borderRadius: 999, overflow: "hidden", paddingVertical: 7, paddingHorizontal: 11, fontFamily: font.bodyBold, fontSize: 12 },
  heroTitle: { marginTop: 10, color: colors.white, fontFamily: font.display, fontSize: 36 },
  heroDates: { marginTop: 6, color: "rgba(255,255,255,0.9)", fontFamily: font.body, fontSize: 15 },
  stats: { marginTop: -26, marginHorizontal: space[5], borderRadius: radius.lg, backgroundColor: colors.white, flexDirection: "row", paddingVertical: space[4] },
  stat: { flex: 1, alignItems: "center", borderLeftWidth: 1, borderLeftColor: colors.line },
  statN: { fontFamily: font.display, fontSize: 22, color: colors.forest },
  statL: { color: colors.muted, fontFamily: font.body, fontSize: 12 },
  section: { paddingHorizontal: space[5], marginTop: space[6] },
  dayCard: { minHeight: 84, padding: space[3], flexDirection: "row", alignItems: "center", gap: space[3], borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.white },
  dayNum: { width: 52, height: 58, borderRadius: radius.sm, backgroundColor: colors.cream, alignItems: "center", justifyContent: "center" },
  dayKicker: { color: colors.muted, fontFamily: font.bodyBold, fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase" },
  dayN: { fontFamily: font.display, fontSize: 20, color: colors.forest },
  dayMeta: { color: colors.muted, fontFamily: font.body, fontSize: 12 },
  dayTheme: { fontFamily: font.displaySemi, fontSize: 16, color: colors.ink },
  dayHighlights: { color: colors.muted, fontFamily: font.body, fontSize: 13 },
  dayCount: { color: colors.forest, fontFamily: font.bodyBold, fontSize: 12 },
  link: { color: colors.forest, fontFamily: font.bodyBold, fontSize: 14 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: space[4], borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: "rgba(255,254,250,0.96)" },
  menuRow: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: space[3], borderBottomWidth: 1, borderBottomColor: colors.line },
  menuText: { fontFamily: font.bodySemi, fontSize: 16, color: colors.ink },
  menuHint: { fontFamily: font.body, fontSize: 12, color: colors.muted },
});
