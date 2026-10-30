import { useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { interestLabel } from "@/domain/logic/labels";
import type { DestinationCard } from "@/domain/types";
import { api } from "@/lib/api";
import { useDebounced } from "@/lib/useDebounced";
import { useStore } from "@/state/store";
import { Button, EmptyState, Spinner } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { colors, font, radius, space } from "@/theme";

export default function Explore() {
  const { startDraft } = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim());
  const destinations = useQuery({
    queryKey: ["destinations", query],
    queryFn: () => api.listDestinations(query),
    placeholderData: keepPreviousData,
  });
  const list = destinations.data ?? [];

  const plan = (d: DestinationCard) => {
    startDraft(`${d.name}, ${d.country}`, d.id);
    router.push("/create");
  };

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + space[4], paddingBottom: space[6] }}
      data={list}
      keyExtractor={(d) => d.id}
      ListHeaderComponent={
        <View>
          <View style={styles.header}>
            <Text style={styles.eyebrow}>Inspiration</Text>
            <Text style={styles.title}>Explore</Text>
          </View>
          <View style={styles.search}>
            <Icon name="search" color={colors.muted} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Search a city, country or interest"
              placeholderTextColor="#a5ada9"
              style={styles.input}
              accessibilityLabel="Search destinations"
              autoCorrect={false}
              returnKeyType="search"
            />
            {q ? (
              <Pressable onPress={() => setQ("")} accessibilityLabel="Clear search" style={styles.clear}>
                <Icon name="x" size={16} />
              </Pressable>
            ) : null}
          </View>
          {destinations.isPending ? (
            <Spinner label="Finding destinations" />
          ) : destinations.isError ? (
            <EmptyState
              icon="alert"
              title="Explore is unavailable"
              body={destinations.error.message}
              action={<Button icon="refresh" onPress={() => { void destinations.refetch(); }}>Try again</Button>}
            />
          ) : list.length === 0 ? (
            <EmptyState
              icon="search"
              title="No matches"
              body={api.mode === "local" ? `We don't have "${q}" in this preview yet. Try Chicago, Seattle or "food".` : `Nothing matched "${q}". Try a city or an interest like "food".`}
            />
          ) : null}
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Image source={{ uri: api.imageUrl(item.image) }} style={styles.photo} contentFit="cover" />
          <View style={styles.body}>
            <Text style={styles.country}>{item.country}</Text>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.blurb}>{item.blurb}</Text>
            <View style={styles.pills}>
              {item.bestFor.map((b) => <Text key={b} style={styles.pill}>{interestLabel(b)}</Text>)}
            </View>
            <Button variant="secondary" icon="plus" onPress={() => plan(item)}>Plan a Trip</Button>
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  header: { paddingHorizontal: space[5], marginBottom: space[4] },
  eyebrow: { color: colors.muted, fontFamily: font.bodyBold, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" },
  title: { fontFamily: font.display, fontSize: 32, color: colors.ink },
  search: { marginHorizontal: space[5], marginBottom: space[5], minHeight: 54, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.white, flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: space[4] },
  input: { flex: 1, minHeight: 48, fontFamily: font.body, fontSize: 16, color: colors.ink },
  clear: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  card: { marginHorizontal: space[5], marginBottom: space[4], borderWidth: 1, borderColor: colors.line, borderRadius: radius.xl, overflow: "hidden", backgroundColor: colors.white },
  photo: { width: "100%", height: 170 },
  body: { padding: space[4], gap: space[2] },
  country: { color: colors.muted, fontFamily: font.bodyBold, fontSize: 12, letterSpacing: 0.8, textTransform: "uppercase" },
  name: { fontFamily: font.display, fontSize: 22, color: colors.ink },
  blurb: { color: "#3f4a45", fontFamily: font.body, fontSize: 14, lineHeight: 20 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill: { backgroundColor: colors.mint, color: colors.forest, borderRadius: 999, overflow: "hidden", paddingVertical: 6, paddingHorizontal: 10, fontFamily: font.bodySemi, fontSize: 13 },
});
