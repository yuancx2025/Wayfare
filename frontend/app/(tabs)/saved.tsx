import { FlatList, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSavedPlaceDetailList, useSavedPlaces } from "@/lib/savedPlaces";
import { CollectionMessage, SavedPlaceRow, SavedRowsLoading } from "@/components/SavedPlaceViews";
import { Button } from "@/components/ui";
import { colors, font } from "@/theme";

export default function SavedPlaces() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const collection = useSavedPlaces();
  const items = collection.data ?? [];
  const details = useSavedPlaceDetailList(items);
  const { refetch } = collection;
  useFocusEffect(useCallback(() => { void refetch(); }, [refetch]));
  const explore = () => router.navigate("/explore");
  return <View style={styles.screen}>
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <Text style={styles.eyebrow}>YOUR COLLECTION</Text><Text style={styles.title}>Saved places</Text>
    </View>
    {collection.data === undefined ? collection.isError ? (
      <CollectionMessage error title="Your saved places can wait." body={"We couldn’t load your collection.\nYour saved places haven’t been removed."}>
        <Button onPress={() => { void refetch(); }}>Try again</Button>
      </CollectionMessage>
    ) : <SavedRowsLoading /> : items.length === 0 ? (
      <CollectionMessage title="Keep your next discovery close." body={"Save a destination or a stop you love.\nFind it here when you’re ready to explore."}>
        <Button onPress={explore}>Explore destinations</Button>
      </CollectionMessage>
    ) : <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.content}
      refreshing={collection.isFetching}
      onRefresh={() => { void refetch(); }}
      ListHeaderComponent={<View style={styles.intro}>
        <Text style={styles.muted}>{items.length} {items.length === 1 ? "place" : "places"}, kept for later.</Text>
        {collection.isError ? <View style={styles.banner}><Text style={styles.error}>{"Couldn't refresh your collection."}</Text><Button variant="ghost" onPress={() => { void refetch(); }}>Try again</Button></View> : null}
      </View>}
      renderItem={({ item, index }) => <SavedPlaceRow saved={item} details={details[index]} onOpen={() => router.push(`/saved-place/${encodeURIComponent(item.id)}`)} />}
      ListFooterComponent={<View style={styles.footer}>
        {details.some((detail) => detail.isError) ? <Button variant="secondary" icon="refresh" onPress={() => { for (const detail of details) if (detail.isError) void detail.refetch(); }}>Retry unavailable details</Button> : null}
        <Text style={styles.muted}>A little inspiration, ready when you are.</Text>
        <Button variant="secondary" onPress={explore}>Explore destinations</Button>
      </View>}
    />}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  header: { paddingHorizontal: 24, paddingBottom: 24, gap: 20 },
  eyebrow: { fontFamily: font.bodyBold, fontSize: 11, letterSpacing: 0.7, color: colors.muted },
  title: { fontFamily: font.display, fontSize: 30, color: colors.ink },
  content: { paddingHorizontal: 24, paddingBottom: 32, gap: 16 },
  intro: { gap: 12, paddingBottom: 12 },
  muted: { fontFamily: font.body, fontSize: 14, lineHeight: 21, color: colors.muted },
  footer: { paddingTop: 12, gap: 24 },
  banner: { padding: 14, borderWidth: 1, borderColor: colors.line, borderRadius: 16, gap: 8 },
  error: { fontFamily: font.body, color: colors.coralInk, fontSize: 13 },
});
