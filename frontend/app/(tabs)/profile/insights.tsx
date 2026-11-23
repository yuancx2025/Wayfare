import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { goBackToProfile } from "@/lib/back";
import { useApi } from "@/lib/api";
import { errorMessage, useStore } from "@/state/store";
import { interestLabel, prefsSentence } from "@/domain/logic/labels";
import type { CategoryCount } from "@/domain/types";
import { Button, EmptyState, ErrorLine, SectionHeading, Spinner, TopBar } from "@/components/ui";
import { colors, font, radius, space } from "@/theme";

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export default function TravelInsights() {
  const api = useApi();
  const router = useRouter();
  const { me, defaultPrefs } = useStore();
  // Keyed by account so a guest and a signed-in user never see each other's numbers. Refetches each time the screen opens.
  const query = useQuery({ queryKey: ["insights", me?.id], queryFn: () => api.getInsights() });
  const insights = query.data;

  let body;
  if (!insights && query.error) {
    body = (
      <View style={styles.status}>
        <ErrorLine message={errorMessage(query.error)} />
        <Button icon="refresh" onPress={() => { void query.refetch(); }}>Try again</Button>
      </View>
    );
  } else if (!insights) {
    body = <View style={styles.status}><Spinner label="Loading your insights" /></View>;
  } else if (insights.trips === 0) {
    body = (
      <View style={styles.status}>
        <EmptyState
          icon="chart"
          title="No trips yet"
          body="Plan a trip and this page will show what your travels have in common."
          action={<Button icon="plus" onPress={() => router.push("/create")}>Plan a trip</Button>}
        />
      </View>
    );
  } else {
    const top = insights.topCategories;
    body = (
      <ScrollView contentContainerStyle={styles.content}>
        <SectionHeading eyebrow="Planned so far" title="Your trips" />
        <View style={styles.grid}>
          <Tile n={insights.trips} label={plural(insights.trips, "trip", "trips")} />
          <Tile n={insights.days} label={plural(insights.days, "day", "days")} />
          <Tile n={insights.stops} label={plural(insights.stops, "stop", "stops")} />
          <Tile n={insights.destinations} label={plural(insights.destinations, "destination", "destinations")} />
        </View>
        <Text style={styles.note}>{"Counts include upcoming trips, not only the ones you've taken."}</Text>

        {top.length > 0 ? (
          <View style={styles.section}>
            <SectionHeading eyebrow="Across your itineraries" title="What you plan most" />
            <View style={styles.card}>
              {top.map((c) => <CategoryRow key={c.category} item={c} max={top[0].places} />)}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <SectionHeading eyebrow="Based on your preferences" title="Your travel style" />
          <View style={styles.card}>
            <Text style={styles.sentence}>{prefsSentence(defaultPrefs)}</Text>
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={styles.screen}>
      <TopBar title="Travel insights" onBack={goBackToProfile} />
      {body}
    </View>
  );
}

function Tile({ n, label }: { n: number; label: string }) {
  return (
    <View style={styles.tile} accessible accessibilityLabel={`${n} ${label} planned`}>
      <Text style={styles.tileN}>{n}</Text>
      <Text style={styles.tileL}>{label} planned</Text>
    </View>
  );
}

function CategoryRow({ item, max }: { item: CategoryCount; max: number }) {
  const label = interestLabel(item.category);
  const places = `${item.places} ${plural(item.places, "place", "places")}`;
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}, ${places}`}>
      <View style={styles.rowHead}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowCount}>{places}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round((item.places / max) * 100)}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  status: { flex: 1, justifyContent: "center", padding: space[5], gap: space[4] },
  content: { padding: space[5], paddingBottom: space[6] },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space[3] },
  tile: { flexGrow: 1, flexBasis: "45%", padding: space[4], borderRadius: radius.lg, backgroundColor: colors.cream },
  tileN: { fontFamily: font.display, fontSize: 26, color: colors.forest },
  tileL: { marginTop: 2, fontFamily: font.body, fontSize: 13, color: colors.muted },
  note: { marginTop: space[3], fontFamily: font.body, fontSize: 13, lineHeight: 18, color: colors.muted },
  section: { marginTop: space[5] },
  card: { gap: space[4], padding: space[4], borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.white },
  row: { gap: space[2] },
  rowHead: { flexDirection: "row", justifyContent: "space-between", gap: space[3] },
  rowLabel: { fontFamily: font.bodySemi, fontSize: 15, color: colors.ink },
  rowCount: { fontFamily: font.body, fontSize: 13, color: colors.muted },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.mint, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.forest },
  sentence: { fontFamily: font.body, fontSize: 15, lineHeight: 22, color: colors.ink },
});
