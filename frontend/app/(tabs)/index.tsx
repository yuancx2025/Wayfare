import { Pressable, SectionList, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { groupTrips } from "@/domain/logic/tripHistory";
import { useToday } from "@/lib/useToday";
import { useStore } from "@/state/store";
import { Button, EmptyState, SectionHeading, Spinner } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { TripCard } from "@/components/trip";
import { colors, font, radius, space, touch } from "@/theme";

export default function Trips() {
  const { summaries, hydrated, loadError, refresh, me, startDraft, loadSample, showToast } = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const today = useToday();
  const sections = hydrated && !loadError ? groupTrips(summaries, today) : [];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const create = () => { startDraft(); router.push("/create"); };
  const sample = loadSample
    ? () => { loadSample().catch((e: Error) => showToast(e.message)); }
    : undefined;
  const firstName = me?.name.split(" ")[0];

  return (
    <SectionList
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + space[4], paddingBottom: space[6] }}
      sections={sections}
      keyExtractor={(trip) => trip.id}
      stickySectionHeadersEnabled={false}
      renderSectionHeader={({ section }) => (
        <View style={styles.section}>
          <SectionHeading title={section.title} />
        </View>
      )}
      renderItem={({ item }) => (
        <View style={styles.cardWrap}>
          <TripCard trip={item} today={today} onPress={() => router.push(`/trip/${item.id}`)} />
        </View>
      )}
      ListHeaderComponent={
        <View>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>{firstName ? `${greeting}, ${firstName}` : greeting}</Text>
              <Text style={styles.title}>Your trips</Text>
            </View>
            <Pressable style={styles.avatar} onPress={() => router.push("/profile")} accessibilityLabel="Open profile">
              <Text style={styles.avatarText}>{me?.initials ?? ""}</Text>
            </Pressable>
          </View>
          <Pressable style={styles.plan} onPress={create} accessibilityRole="button">
            <View style={styles.planIcon}><Icon name="spark" size={24} color={colors.sand} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.planTitle}>Create Trip</Text>
              <Text style={styles.planSub}>A day-by-day plan shaped by your preferences</Text>
            </View>
            <View style={styles.planArrow}><Icon name="plus" color={colors.white} /></View>
          </Pressable>
          {!hydrated ? (
            <Spinner label="Loading your trips" />
          ) : loadError ? (
            <EmptyState
              icon="alert"
              title="We couldn't load your trips"
              body={loadError}
              action={<Button icon="refresh" onPress={() => { void refresh(); }}>Try again</Button>}
            />
          ) : sections.length === 0 ? (
            <EmptyState
              icon="map"
              title="Plan your first trip"
              body="Tell us where and when, choose your pace and interests, and we'll draft a realistic daily itinerary with travel times and a map."
              action={
                <View style={{ gap: space[2], alignSelf: "stretch" }}>
                  <Button onPress={create} icon="plus">Create your first trip</Button>
                  {sample ? <Button variant="secondary" onPress={sample}>Load a sample trip</Button> : null}
                </View>
              }
            />
          ) : null}
        </View>
      }
      ListFooterComponent={
        <Pressable style={styles.inspo} onPress={() => router.push("/explore")}>
          <Icon name="compass" size={18} color={colors.muted} />
          <Text style={styles.inspoText}>Need an idea? Browse destinations in Explore</Text>
          <Icon name="chevron" size={18} color={colors.muted} />
        </Pressable>
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: space[5], marginBottom: space[4] },
  eyebrow: { color: colors.muted, fontFamily: font.bodyBold, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" },
  title: { fontFamily: font.display, fontSize: 32, color: colors.ink },
  avatar: { width: touch, height: touch, borderRadius: touch / 2, backgroundColor: colors.forest, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.white, fontFamily: font.bodyBold },
  plan: { marginHorizontal: space[5], marginBottom: space[6], minHeight: 84, borderRadius: radius.lg, backgroundColor: colors.forest, padding: space[4], flexDirection: "row", alignItems: "center", gap: 13 },
  planIcon: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  planTitle: { color: colors.white, fontFamily: font.displaySemi, fontSize: 17 },
  planSub: { marginTop: 3, color: "rgba(255,255,255,0.72)", fontFamily: font.body, fontSize: 13 },
  planArrow: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" },
  section: { paddingHorizontal: space[5] },
  cardWrap: { paddingHorizontal: space[5], marginBottom: space[4] },
  inspo: { marginHorizontal: space[5], marginTop: space[4], minHeight: 56, borderWidth: 1, borderStyle: "dashed", borderColor: "#cdd3cd", borderRadius: radius.md, paddingHorizontal: space[4], flexDirection: "row", alignItems: "center", gap: space[3] },
  inspoText: { flex: 1, color: colors.muted, fontFamily: font.body, fontSize: 14 },
});
