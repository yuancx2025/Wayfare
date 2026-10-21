import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { DESTINATIONS } from "@/domain/data/places";
import { fmtDistance } from "@/domain/lib/format";
import { interestLabel } from "@/domain/logic/labels";
import { DEFAULT_NEARBY_RADIUS_M, MAX_NEARBY_RADIUS_M } from "@/domain/logic/nearby";
import type { NearbyCategory } from "@/domain/types";
import { api } from "@/lib/api";
import { useCurrentLocation, type LocationStatus } from "@/lib/useCurrentLocation";
import { Button, ChipGroup, EmptyState, SectionHeading, Spinner } from "@/components/ui";
import TripMap from "@/components/TripMap";
import { colors, font, radius, space } from "@/theme";

const CATEGORY_OPTIONS: { value: NearbyCategory; label: string }[] = [
  { value: "all", label: "All" },
  { value: "food", label: "Food" },
  { value: "attractions", label: "Attractions" },
];

export const LOCATION_PROBLEMS: Partial<Record<LocationStatus, { title: string; body: string; settings?: boolean }>> = {
  denied: { title: "Location not shared", body: "Nearby places need your location. You can still search destinations above." },
  blocked: { title: "Location is off for Wayfare", body: "Allow location access for Wayfare in Settings, or keep searching destinations above.", settings: true },
  off: { title: "Location Services are off", body: "Turn on Location Services in your device settings, then try again. Destination search still works." },
  timeout: { title: "Couldn't find you in time", body: "Your device took too long to get a position. Try again, or search destinations above." },
  error: { title: "Couldn't get your location", body: "Something went wrong reading your position. Try again, or search destinations above." },
};

const CATALOG_CITIES = DESTINATIONS.map((d) => d.name).join(", ");

/** "Use my location" plus the closest food and sights. Location is read only when the user asks. */
export function NearbySection() {
  const loc = useCurrentLocation();
  const [category, setCategory] = useState<NearbyCategory>("all");
  const [radiusM, setRadiusM] = useState(DEFAULT_NEARBY_RADIUS_M);
  const pos = loc.status === "ready" ? loc.position : null;
  const nearby = useQuery({
    queryKey: ["nearby", pos?.lat, pos?.lng, category, radiusM],
    queryFn: () => api.nearbyPlaces({ lat: pos!.lat, lng: pos!.lng, category, radiusM }),
    enabled: !!pos,
    retry: false,
  });
  const problem = LOCATION_PROBLEMS[loc.status];
  const locate = () => { void loc.locate(); };

  return (
    <View style={styles.section}>
      <SectionHeading
        eyebrow="Around you"
        title="Nearby"
        action={pos ? <Button variant="ghost" icon="refresh" full={false} onPress={locate}>Refresh</Button> : undefined}
      />
      {loc.status === "idle" ? (
        <View style={styles.intro}>
          <Text style={styles.text}>
            See food and sights within walking distance. Wayfare asks for your location only when you tap below, and never tracks you in the background.
          </Text>
          <Button icon="pin" onPress={locate}>Use my location</Button>
        </View>
      ) : loc.status === "locating" ? (
        <Spinner label="Finding your location" />
      ) : problem ? (
        <EmptyState
          icon="alert"
          title={problem.title}
          body={problem.body}
          action={
            <View style={styles.actions}>
              {problem.settings ? <Button variant="secondary" onPress={loc.openSettings}>Open Settings</Button> : null}
              <Button variant={problem.settings ? "ghost" : "secondary"} icon="refresh" onPress={locate}>Try again</Button>
            </View>
          }
        />
      ) : pos ? (
        <View style={styles.results}>
          <ChipGroup options={CATEGORY_OPTIONS} value={category} onChange={setCategory} />
          <Text style={styles.meta}>
            Within {fmtDistance(radiusM)} · straight-line distance, not a walking route{loc.approximate ? " · approximate location" : ""}
          </Text>
          {nearby.isPending ? (
            <Spinner label="Looking around you" />
          ) : nearby.isError ? (
            <EmptyState
              icon="alert"
              title="Nearby search is unavailable"
              body={nearby.error.message}
              action={<Button variant="secondary" icon="refresh" onPress={() => { void nearby.refetch(); }}>Try again</Button>}
            />
          ) : nearby.data.places.length === 0 ? (
            <EmptyState
              icon="compass"
              title={`Nothing within ${fmtDistance(radiusM)}`}
              body={nearby.data.source === "catalog"
                ? `Without live places, Wayfare only knows ${CATALOG_CITIES}.`
                : "Try another category or a wider radius."}
              action={radiusM < MAX_NEARBY_RADIUS_M
                ? <Button variant="secondary" onPress={() => setRadiusM(MAX_NEARBY_RADIUS_M)}>Search within 5 km</Button>
                : undefined}
            />
          ) : (
            <>
              <TripMap
                activities={nearby.data.places.map((n) => n.place)}
                userPosition={pos}
                showOrder={false}
                height={200}
                caption="Blue dot is you · numbers match the list"
              />
              <Text style={styles.source}>
                {nearby.data.source === "google" ? "Live results from Google Places" : "From Wayfare's bundled catalog"}
              </Text>
              {nearby.data.places.map((n, i) => (
                <View key={n.place.id} style={styles.row}>
                  <Text style={styles.index}>{i + 1}</Text>
                  <View style={styles.rowBody}>
                    <Text style={styles.name} numberOfLines={1}>{n.place.name}</Text>
                    <Text style={styles.detail} numberOfLines={1}>{interestLabel(n.place.category)} · {n.place.area}</Text>
                  </View>
                  <Text style={styles.distance}>{fmtDistance(n.distanceM)}</Text>
                </View>
              ))}
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginHorizontal: space[5], marginBottom: space[5], padding: space[4], borderWidth: 1, borderColor: colors.line, borderRadius: radius.xl, backgroundColor: colors.white, gap: space[3] },
  intro: { gap: space[3] },
  actions: { alignSelf: "stretch", gap: space[2] },
  text: { color: "#3f4a45", fontFamily: font.body, fontSize: 14, lineHeight: 20 },
  results: { gap: space[3] },
  meta: { color: colors.muted, fontFamily: font.body, fontSize: 12 },
  source: { color: colors.muted, fontFamily: font.bodySemi, fontSize: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: space[3], paddingVertical: space[2], borderTopWidth: 1, borderTopColor: colors.line },
  index: { width: 24, height: 24, borderRadius: 12, overflow: "hidden", backgroundColor: colors.forest, color: colors.white, textAlign: "center", lineHeight: 24, fontFamily: font.bodyBold, fontSize: 12 },
  rowBody: { flex: 1 },
  name: { color: colors.ink, fontFamily: font.bodyBold, fontSize: 15 },
  detail: { color: colors.muted, fontFamily: font.body, fontSize: 13 },
  distance: { color: colors.forest, fontFamily: font.bodyBold, fontSize: 13 },
});
