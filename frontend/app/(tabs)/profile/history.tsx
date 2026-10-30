import { SectionList, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { groupTrips } from "@/domain/logic/tripHistory";
import { useToday } from "@/lib/useToday";
import { errorMessage, useStore } from "@/state/store";
import { Button, EmptyState, SectionHeading, TopBar } from "@/components/ui";
import { RemoteSpinner } from "@/components/RemoteSpinner";
import { TripHistoryRow } from "@/components/trip";
import { colors, space } from "@/theme";

export default function TripHistory() {
  const router = useRouter();
  const today = useToday();
  const { summaries, hydrated, loadError, refresh, loadHistoryFixtures, showToast } = useStore();
  const sections = hydrated && !loadError ? groupTrips(summaries, today) : [];
  const open = (id: string) => router.push(`/trip/${id}`);
  const fixtures = __DEV__ && loadHistoryFixtures ? (
    <Button
      variant="secondary"
      onPress={() => { loadHistoryFixtures().catch((e: unknown) => showToast(errorMessage(e))); }}
    >
      Load history fixtures
    </Button>
  ) : null;

  return (
    <View style={styles.screen}>
      <TopBar title="Trip history" onBack={() => router.back()} />
      {!hydrated ? (
        <View style={styles.fill}><RemoteSpinner label="Loading your trips" /></View>
      ) : loadError ? (
        <View style={styles.fill}>
          <EmptyState
            icon="alert"
            title="We couldn't load your trips"
            body={loadError}
            action={<Button icon="refresh" onPress={() => { void refresh(); }}>Try again</Button>}
          />
        </View>
      ) : (
        <SectionList
          style={styles.list}
          contentContainerStyle={styles.content}
          sections={sections}
          keyExtractor={(trip) => trip.id}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <View style={styles.section}>
              <SectionHeading title={section.title} />
            </View>
          )}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <TripHistoryRow trip={item} today={today} onPress={() => open(item.id)} />
            </View>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="calendar"
              title="No trips yet"
              body="Trips you plan will be grouped into ongoing, upcoming, and past."
              action={fixtures}
            />
          }
          ListFooterComponent={sections.length > 0 && fixtures ? <View style={styles.fixtures}>{fixtures}</View> : null}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  fill: { flex: 1, justifyContent: "center" },
  list: { flex: 1 },
  content: { paddingBottom: space[6], flexGrow: 1 },
  section: { paddingHorizontal: space[5], paddingTop: space[4] },
  row: { paddingHorizontal: space[5], marginBottom: space[3] },
  fixtures: { paddingHorizontal: space[5], paddingTop: space[2] },
});
