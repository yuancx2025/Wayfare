import type { ReactNode } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "@/state/store";
import { useToday } from "@/lib/useToday";
import { goBackToProfile } from "@/lib/back";
import { Button } from "@/components/ui";
import { Icon, type IconName } from "@/components/Icon";
import { TripCard } from "@/components/trip";
import { colors, font, radius, space, touch } from "@/theme";

export default function FavoriteTrips() {
  const { summaries, hydrated, refreshing, loadError, refresh } = useStore();
  const router = useRouter();
  const today = useToday();
  const insets = useSafeAreaInsets();
  const favorites = summaries.filter((trip) => trip.isFavorite);
  const browse = () => router.navigate("/");
  const loading = !hydrated || (refreshing && Boolean(loadError));

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + space[2] }]}>
        <Pressable onPress={goBackToProfile} style={styles.back} accessibilityRole="button" accessibilityLabel="Back to Profile">
          <Icon name="back" /><Text style={styles.eyebrow}>YOUR COLLECTION</Text>
        </Pressable>
        <Text style={styles.title}>Favorite trips</Text>
      </View>
      {loading ? (
        <View style={styles.content} accessibilityLabel="Loading your favorites" accessibilityState={{ busy: true }}>
          <Text style={styles.muted}>Loading your favorites…</Text>
          {[0, 1].map((key) => <View key={key} style={styles.skeleton}>
            <View style={styles.skeletonImage} />
            <View style={styles.skeletonText}><View style={styles.skeletonTitle} /><View style={styles.skeletonLine} /><View style={styles.skeletonTag} /></View>
          </View>)}
        </View>
      ) : loadError ? (
        <CollectionMessage icon="alert" title="Your favorites can wait." body={"We couldn’t load them just now.\nYour saved trips haven’t been removed."} error>
          <Button onPress={() => { void refresh(); }}>Try again</Button>
          <Button variant="secondary" onPress={goBackToProfile}>Back to Profile</Button>
        </CollectionMessage>
      ) : favorites.length === 0 ? (
        <CollectionMessage icon="heart-outline" title="Keep a good plan close." body={"Tap the heart on any trip to find it here.\nA little inspiration, ready when you are."}>
          <Button onPress={browse}>Browse your trips</Button>
        </CollectionMessage>
      ) : (
        <FlatList
          data={favorites}
          keyExtractor={(trip) => trip.id}
          contentContainerStyle={styles.content}
          refreshing={refreshing}
          onRefresh={() => { void refresh(); }}
          ListHeaderComponent={<Text style={styles.muted}>{favorites.length} {favorites.length === 1 ? "trip" : "trips"}, kept close.</Text>}
          renderItem={({ item }) => <TripCard trip={item} today={today} onPress={() => router.push(`/trip/${item.id}`)} />}
          ListFooterComponent={<View style={styles.footer}>
            <View style={styles.note}>
              <Text style={styles.noteTitle}>Your plans, unchanged</Text>
              <Text style={styles.noteBody}>Favorites help you find a trip again. Dates, activities and preferences stay as planned.</Text>
            </View>
            <Button variant="secondary" onPress={browse}>Browse all trips</Button>
          </View>}
        />
      )}
    </View>
  );
}

function CollectionMessage({ icon, title, body, error, children }: {
  icon: IconName; title: string; body: string; error?: boolean; children: ReactNode;
}) {
  return <View style={styles.message}>
    <View style={[styles.messageIcon, error && styles.errorIcon]}><Icon name={icon} size={40} color={error ? colors.coralInk : colors.forest} /></View>
    <Text style={styles.messageTitle}>{title}</Text>
    <Text style={styles.messageBody}>{body}</Text>
    <View style={styles.actions}>{children}</View>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  header: { paddingHorizontal: 24, paddingBottom: 12 },
  back: { minHeight: touch, flexDirection: "row", alignItems: "center", gap: 12, alignSelf: "flex-start" },
  eyebrow: { color: colors.muted, fontFamily: font.bodyBold, fontSize: 11, letterSpacing: 0.7 },
  title: { color: colors.ink, fontFamily: font.display, fontSize: 30, marginTop: 12 },
  content: { paddingHorizontal: 24, paddingBottom: 32, gap: 24 },
  muted: { color: colors.muted, fontFamily: font.body, fontSize: 14 },
  message: { flex: 1, paddingHorizontal: 24, paddingTop: 48, paddingBottom: 32, justifyContent: "center", alignItems: "center" },
  messageIcon: { width: 80, height: 80, borderRadius: 26, backgroundColor: colors.mint, alignItems: "center", justifyContent: "center", marginBottom: 30 },
  errorIcon: { backgroundColor: "#fbe8e3" },
  messageTitle: { color: colors.ink, fontFamily: font.displaySemi, fontSize: 23, textAlign: "center" },
  messageBody: { color: colors.muted, fontFamily: font.body, fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 18 },
  actions: { alignSelf: "stretch", marginTop: 36, gap: 12 },
  footer: { gap: 32, paddingTop: 8 },
  note: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.white, padding: 20, gap: 8 },
  noteTitle: { color: colors.forest, fontFamily: font.bodyBold, fontSize: 13 },
  noteBody: { color: colors.muted, fontFamily: font.body, fontSize: 12, lineHeight: 18 },
  skeleton: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: "hidden", backgroundColor: colors.white },
  skeletonImage: { height: 132, backgroundColor: "#e9ece6" },
  skeletonText: { padding: 18, gap: 12 },
  skeletonTitle: { width: "65%", height: 16, borderRadius: 5, backgroundColor: "#e9ece6" },
  skeletonLine: { width: "88%", height: 10, borderRadius: 5, backgroundColor: "#e9ece6" },
  skeletonTag: { width: "40%", height: 10, borderRadius: 5, backgroundColor: "#e9ece6" },
});
