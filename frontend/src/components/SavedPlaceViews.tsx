import type { ReactNode } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import type { UseQueryResult } from "@tanstack/react-query";
import type { SavedPlace, SavedPlaceDetails } from "@/domain/types";
import { interestLabel } from "@/domain/logic/labels";
import { api } from "@/lib/api";
import { useStore } from "@/state/store";
import { Button } from "./ui";
import { Icon } from "./Icon";
import { SavePlaceButton } from "./SavePlaceButton";
import { colors, font, radius } from "@/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function CollectionMessage({ title, body, error = false, children }: { title: string; body: string; error?: boolean; children: ReactNode }) {
  return <View style={styles.message}>
    <View style={[styles.messageIcon, error && styles.errorIcon]}><Icon name={error ? "alert" : "bookmark"} size={40} color={error ? colors.coralInk : colors.forest} /></View>
    <Text style={styles.messageTitle}>{title}</Text>
    <Text style={styles.messageBody}>{body}</Text>
    <View style={styles.messageActions}>{children}</View>
  </View>;
}

export function SavedPlaceRow({ saved, details, onOpen }: { saved: SavedPlace; details: UseQueryResult<SavedPlaceDetails, Error>; onOpen: () => void }) {
  const name = details.data?.name ?? (saved.kind === "destination" ? "Saved destination" : "Saved place");
  return <View style={styles.row}>
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`Open ${name}`} style={styles.rowMain}>
      <View style={styles.thumbnail}>
        {details.data?.image ? <Image source={{ uri: api.imageUrl(details.data.image) }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Icon name="bookmark" size={26} color={colors.forest} />}
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.kind}>{saved.kind.toUpperCase()}</Text>
        <Text style={styles.rowName} numberOfLines={2}>{name}</Text>
        <Text style={[styles.subtitle, details.isError && styles.errorText]} numberOfLines={2}>{details.isError ? "Details unavailable" : details.data?.subtitle ?? "Loading details…"}</Text>
      </View>
    </Pressable>
    <View style={styles.rowSave}><SavePlaceButton reference={saved} name={name} /></View>
  </View>;
}

export function SavedRowsLoading() {
  return <View style={styles.skeletons} accessibilityLabel="Loading saved places" accessibilityState={{ busy: true }}>
    <Text style={styles.subtitle}>Loading your saved places…</Text>
    {[0, 1, 2].map((index) => <View key={index} style={styles.skeletonRow}>
      <View style={styles.skeletonImage} /><View style={styles.skeletonCopy}><View style={styles.skeletonTitle} /><View style={styles.skeletonLine} /></View>
    </View>)}
  </View>;
}

/** Present provider content without manufacturing itinerary times, activities or trip links. */
export function PlaceDetailsBody({ details, kind, children, footer }: { details: Omit<SavedPlaceDetails, "reference">; kind: "destination" | "place"; children?: ReactNode; footer?: ReactNode }) {
  const { showToast } = useStore();
  const open = async (url: string) => {
    try {
      if (!/^https?:\/\//i.test(url)) throw new Error("Unsupported link");
      await Linking.openURL(url);
    } catch { showToast("Couldn't open this link. Try again."); }
  };
  return <View style={styles.detailsBody}>
    <Text style={styles.kind}>{kind.toUpperCase()}</Text>
    <Text style={styles.detailsName}>{details.name}</Text>
    <Text style={styles.detailsSubtitle}>{details.subtitle}</Text>
    {details.rating !== undefined ? <View style={styles.rating}><Icon name="star" size={16} color="#b07d2c" /><Text style={styles.ratingText}>{details.rating.toFixed(1)}</Text></View> : null}
    {details.description ? <Text style={styles.description}>{details.description}</Text> : null}
    {details.bestFor?.length ? <View style={styles.pills}>{details.bestFor.map((interest) => <Text key={interest} style={styles.pill}>{interestLabel(interest)}</Text>)}</View> : null}
    {details.weekdayDescriptions?.length ? <View style={styles.hours} accessibilityLabel="Opening hours">{details.weekdayDescriptions.map((day) => <Text key={day} style={styles.subtitle}>{day}</Text>)}</View> : null}
    <View style={styles.detailActions}>
      {children}
      {details.googleMapsUri ? <Button variant="secondary" icon="map" onPress={() => { void open(details.googleMapsUri!); }}>Open in Google Maps</Button> : null}
      {details.websiteUri ? <Button variant="ghost" icon="compass" onPress={() => { void open(details.websiteUri!); }}>Website</Button> : null}
      {footer}
    </View>
  </View>;
}

export function PlaceIllustration() {
  return <View style={styles.illustration}><Icon name="bookmark" size={48} color={colors.forest} /></View>;
}

export function CollectionDetailHeader({ title = "Place details", onBack }: { title?: string; onBack: () => void }) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.detailHeader, { paddingTop: insets.top + 8 }]}>
    <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Go back" style={styles.back}>
      <Icon name="back" /><Text style={styles.eyebrow}>YOUR COLLECTION</Text>
    </Pressable><Text style={styles.detailTitle}>{title}</Text>
  </View>;
}

export function DestinationHero({ image, onBack, action }: { image: string; onBack: () => void; action?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return <View style={{ paddingTop: insets.top }}>
    <Image source={{ uri: api.imageUrl(image) }} contentFit="cover" style={styles.hero} />
    <View style={[styles.heroActions, { top: insets.top + 16 }]}>
      <Pressable style={styles.heroBack} onPress={onBack} accessibilityRole="button" accessibilityLabel="Go back"><Icon name="back" color={colors.forest} /></Pressable>
      {action}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  message: { flex: 1, paddingHorizontal: 24, paddingTop: 48, paddingBottom: 32, justifyContent: "center", alignItems: "center" },
  messageIcon: { width: 80, height: 80, borderRadius: 26, backgroundColor: colors.mint, alignItems: "center", justifyContent: "center", marginBottom: 30 },
  errorIcon: { backgroundColor: "#fbe8e3" },
  messageTitle: { color: colors.ink, fontFamily: font.displaySemi, fontSize: 23, textAlign: "center" },
  messageBody: { color: colors.muted, fontFamily: font.body, fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 18 },
  messageActions: { alignSelf: "stretch", marginTop: 36, gap: 12 },
  row: { minHeight: 116, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, backgroundColor: colors.white, flexDirection: "row", alignItems: "center", overflow: "hidden" },
  rowMain: { flex: 1, minHeight: 114, flexDirection: "row", alignItems: "center", padding: 14, gap: 14 },
  thumbnail: { width: 76, height: 80, borderRadius: radius.md, backgroundColor: colors.mint, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  rowCopy: { flex: 1, gap: 5 },
  kind: { color: colors.muted, fontFamily: font.bodyBold, fontSize: 10, letterSpacing: 0.7 },
  rowName: { color: colors.ink, fontFamily: font.displaySemi, fontSize: 16 },
  subtitle: { color: colors.muted, fontFamily: font.body, fontSize: 12, lineHeight: 18 },
  rowSave: { paddingRight: 14 },
  errorText: { color: colors.coralInk },
  skeletons: { paddingHorizontal: 24, gap: 16 },
  skeletonRow: { height: 116, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, backgroundColor: colors.white, padding: 14, flexDirection: "row", alignItems: "center", gap: 14 },
  skeletonImage: { width: 76, height: 80, borderRadius: radius.md, backgroundColor: "#e9ece6" },
  skeletonCopy: { flex: 1, gap: 16 },
  skeletonTitle: { width: "90%", height: 14, borderRadius: 5, backgroundColor: "#e9ece6" },
  skeletonLine: { width: "70%", height: 10, borderRadius: 5, backgroundColor: "#e9ece6" },
  detailsBody: { paddingHorizontal: 24, paddingTop: 30, paddingBottom: 32, gap: 14 },
  detailsName: { color: colors.ink, fontFamily: font.display, fontSize: 28 },
  detailsSubtitle: { color: colors.muted, fontFamily: font.body, fontSize: 14 },
  description: { color: colors.ink, fontFamily: font.body, fontSize: 15, lineHeight: 23, marginTop: 18 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 },
  pill: { color: colors.forest, backgroundColor: colors.mint, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, overflow: "hidden", fontFamily: font.bodySemi, fontSize: 12 },
  hours: { gap: 6, marginTop: 12 },
  rating: { flexDirection: "row", alignItems: "center", gap: 6 },
  ratingText: { color: colors.ink, fontFamily: font.bodySemi, fontSize: 14 },
  detailActions: { gap: 12, marginTop: 24 },
  illustration: { height: 126, marginHorizontal: 24, marginTop: 24, borderRadius: radius.lg, backgroundColor: colors.mint, alignItems: "center", justifyContent: "center" },
  detailHeader: { paddingHorizontal: 24, paddingBottom: 12 },
  back: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12, alignSelf: "flex-start" },
  eyebrow: { color: colors.muted, fontFamily: font.bodyBold, fontSize: 11, letterSpacing: 0.7 },
  detailTitle: { color: colors.ink, fontFamily: font.display, fontSize: 30, marginTop: 12 },
  hero: { height: 222, backgroundColor: colors.cream },
  heroActions: { position: "absolute", left: 24, right: 24, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroBack: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.paper, alignItems: "center", justifyContent: "center" },
});
