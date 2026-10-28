import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { Activity } from "@/domain/types";
import { fmtDistance, fmtDuration, fmtTime } from "@/domain/lib/format";
import { distanceKm } from "@/domain/logic/generate";
import { useCurrentLocation } from "@/state/location";
import { CATEGORY_LABEL, LEG_LABEL } from "@/domain/logic/labels";
import { api } from "@/lib/api";
import { BottomSheet, Button } from "./ui";
import { Icon, type IconName } from "./Icon";
import { colors, font, radius, touch } from "@/theme";

function usePlaceDetails(activity: Activity | null, date?: string) {
  return useQuery({
    queryKey: ["place", activity?.placeId, date, activity?.startMin, activity?.durationMin],
    queryFn: () => api.placeDetails(activity!.placeId, date ? { date, startMin: activity!.startMin, durationMin: activity!.durationMin } : undefined),
    enabled: !!activity,
    staleTime: 10 * 60 * 1000,
    retry: false,
  }).data;
}

export default function ActivityDetailSheet({ activity, number, date, onClose, onShowMap }: {
  activity: Activity | null; number: number; date?: string; onClose: () => void; onShowMap?: () => void;
}) {
  const details = usePlaceDetails(activity, date);
  const hours = details?.weekdayDescriptions ?? [];

  return (
    <BottomSheet
      open={!!activity}
      onClose={onClose}
      title={activity ? `Stop ${number}` : undefined}
      footer={onShowMap ? <Button variant="secondary" icon="map" onPress={onShowMap}>Show on map</Button> : undefined}
    >
      {activity ? (
        <View style={styles.detail}>
          <Text style={styles.cat}>{CATEGORY_LABEL[activity.category]}</Text>
          <Text style={styles.name}>{activity.name}</Text>
          <View style={styles.areaRow}>
            <Icon name="pin" size={14} color={colors.muted} />
            <Text style={styles.area}>{activity.area}</Text>
            {details?.rating ? (
              <View style={styles.rating}>
                <Icon name="star" size={14} color="#b07d2c" />
                <Text style={styles.ratingText}>
                  {details.rating.toFixed(1)}
                  {details.userRatingCount ? <Text style={styles.area}> ({details.userRatingCount.toLocaleString()})</Text> : null}
                </Text>
              </View>
            ) : null}
          </View>
          <DistanceFromYou to={activity} />
          <View style={styles.facts}>
            <Fact label="Starts" value={fmtTime(activity.startMin)} />
            <Fact label="Time here" value={fmtDuration(activity.durationMin)} />
            <Fact label="Getting there" value={activity.legIn ? `${LEG_LABEL[activity.legIn.mode]} ~${activity.legIn.minutes}m` : "First stop"} />
          </View>
          {details?.openDuringVisit === false ? (
            <View style={styles.warn}>
              <Icon name="alert" size={14} color={colors.coralInk} />
              <Text style={styles.warnText}>May be closed at this time — check before you go.</Text>
            </View>
          ) : null}
          <Text style={styles.body}>{activity.description}</Text>
          <View style={styles.why}>
            <Icon name="spark" size={14} color="#b07d2c" />
            <Text style={styles.whyText}><Text style={styles.whyLabel}>Why this fits you{"\n"}</Text>{activity.why}</Text>
          </View>
          {hours.length ? (
            <View style={styles.hours} accessibilityLabel="Opening hours">
              {hours.map((d) => <Text key={d} style={styles.hoursText}>{d}</Text>)}
            </View>
          ) : null}
          {details?.googleMapsUri || details?.websiteUri ? (
            <View style={styles.links}>
              {details.googleMapsUri ? <ExtLink icon="map" label="Open in Google Maps" url={details.googleMapsUri} /> : null}
              {details.websiteUri ? <ExtLink icon="compass" label="Website" url={details.websiteUri} /> : null}
            </View>
          ) : null}
          {activity.legIn ? (
            <Text style={styles.fine}>
              {activity.legIn.source === "google"
                ? "Travel times come from Google and don't account for live conditions."
                : "Travel times are estimates and don't account for live conditions."}
            </Text>
          ) : null}
        </View>
      ) : null}
    </BottomSheet>
  );
}

/** "How far am I?" for this stop. Uses the shared fix; locates only when tapped. */
function DistanceFromYou({ to }: { to: { lat: number; lng: number } }) {
  const loc = useCurrentLocation();
  const problem = loc.problem;
  if (loc.status === "ready" && loc.position) {
    return (
      <View style={styles.distance}>
        <Icon name="pin" size={14} color={colors.forest} />
        <Text style={styles.distanceText}>
          <Text style={styles.distanceValue}>{fmtDistance(Math.round(distanceKm(loc.position, to) * 1000))}</Text> from you · straight line
        </Text>
        <Pressable style={styles.distanceAction} onPress={() => { void loc.locate(); }} accessibilityRole="button" accessibilityLabel="Refresh my location">
          <Icon name="refresh" size={14} color={colors.forest} />
        </Pressable>
      </View>
    );
  }
  return (
    <Pressable
      style={styles.distance}
      onPress={problem?.settings ? loc.openSettings : () => { void loc.locate(); }}
      disabled={loc.status === "locating"}
      accessibilityRole="button"
    >
      <Icon name="pin" size={14} color={colors.forest} />
      <Text style={styles.distanceText}>
        {loc.status === "locating" ? "Finding your location…"
          : problem ? `${problem.title} · ${problem.settings ? "Open Settings" : "Try again"}`
          : <Text style={styles.distanceValue}>How far am I from here?</Text>}
      </Text>
    </Pressable>
  );
}

function ExtLink({ icon, label, url }: { icon: IconName; label: string; url: string }) {
  return (
    <Pressable style={styles.link} onPress={() => { Linking.openURL(url).catch(() => undefined); }} accessibilityRole="link">
      <Icon name={icon} size={15} color={colors.forest} />
      <Text style={styles.linkText}>{label}</Text>
    </Pressable>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  detail: { gap: 12 },
  cat: { alignSelf: "flex-start", backgroundColor: colors.mint, color: colors.forest, fontFamily: font.bodyBold, fontSize: 12, borderRadius: 999, overflow: "hidden", paddingVertical: 4, paddingHorizontal: 8 },
  name: { fontFamily: font.display, fontSize: 24, color: colors.ink },
  areaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  area: { color: colors.muted, fontFamily: font.body, fontSize: 13 },
  rating: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 4 },
  ratingText: { fontFamily: font.bodyBold, fontSize: 13, color: colors.ink },
  facts: { flexDirection: "row", gap: 6 },
  fact: { flex: 1, backgroundColor: colors.cream, borderRadius: radius.sm, padding: 10 },
  factLabel: { color: colors.muted, fontFamily: font.bodyBold, fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase" },
  factValue: { marginTop: 2, fontFamily: font.bodySemi, fontSize: 13, color: colors.ink },
  warn: { flexDirection: "row", gap: 6, alignItems: "center", backgroundColor: "#fbe8e3", borderRadius: radius.sm, padding: 10 },
  warnText: { flex: 1, color: colors.coralInk, fontFamily: font.bodySemi, fontSize: 13 },
  body: { color: "#3f4a45", fontFamily: font.body, fontSize: 15, lineHeight: 22 },
  why: { flexDirection: "row", gap: 8, backgroundColor: "#f0f6f2", borderRadius: radius.sm, padding: 10 },
  whyText: { flex: 1, color: colors.forest, fontFamily: font.body, fontSize: 13, lineHeight: 18 },
  whyLabel: { fontFamily: font.bodyBold, fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase" },
  hours: { gap: 2 },
  hoursText: { color: colors.muted, fontFamily: font.body, fontSize: 13, lineHeight: 18 },
  distance: { minHeight: touch, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#f0f6f2", borderRadius: radius.sm, paddingHorizontal: 10 },
  distanceText: { flex: 1, color: colors.forest, fontFamily: font.body, fontSize: 13 },
  distanceValue: { fontFamily: font.bodyBold },
  distanceAction: { width: touch, height: touch, alignItems: "center", justifyContent: "center" },
  links: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  link: { minHeight: touch, flexDirection: "row", alignItems: "center", gap: 6 },
  linkText: { color: colors.forest, fontFamily: font.bodyBold, fontSize: 14 },
  fine: { color: colors.muted, fontFamily: font.body, fontSize: 12, lineHeight: 18 },
});
