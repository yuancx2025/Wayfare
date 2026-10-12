import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import { decodePolyline } from "@/lib/polyline";
import { colors, font, radius } from "@/theme";
import TripMapFallback, { type TripMapProps } from "./TripMapFallback";

const LEG_COLOR = { walk: "#164b3b", transit: "#2f6f9f", drive: "#7a5bb5" } as const;

// Web uses TripMap.web.tsx. On native, a build without the maps module is caught by MapBoundary.
class MapBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export default function TripMap(props: TripMapProps) {
  const { activities, route, selectedId, onSelect, height = 220, fill = false, interactive = true, label = (i: number) => String(i + 1), showOrder = true } = props;
  const mapRef = useRef<MapView>(null);
  const [tracking, setTracking] = useState(true);
  const legs = useMemo(
    () => (route?.legs ?? []).flatMap((l) => (l.polyline ? [{ key: `${l.fromId}-${l.toId}`, mode: l.mode, path: decodePolyline(l.polyline) }] : [])),
    [route],
  );

  useEffect(() => {
    setTracking(true);
    const timer = setTimeout(() => setTracking(false), 400);
    return () => clearTimeout(timer);
  }, [selectedId, activities]);

  useEffect(() => {
    if (!activities.length) return;
    mapRef.current?.fitToCoordinates(
      activities.map((a) => ({ latitude: a.lat, longitude: a.lng })),
      { edgePadding: { top: 48, right: 40, bottom: interactive ? 72 : 36, left: 40 }, animated: false },
    );
  }, [activities, interactive, selectedId]);

  return (
    <MapBoundary fallback={<TripMapFallback {...props} />}>
      <View style={[styles.wrap, fill ? styles.fill : { height }]}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          scrollEnabled={interactive}
          zoomEnabled={interactive}
          rotateEnabled={false}
          pitchEnabled={false}
          pointerEvents={interactive ? "auto" : "none"}
        >
          {legs.map((l) => (
            <Polyline key={l.key} coordinates={l.path} strokeColor={LEG_COLOR[l.mode]} strokeWidth={4} />
          ))}
          {!legs.length && showOrder && activities.length > 1 ? (
            <Polyline
              coordinates={activities.map((a) => ({ latitude: a.lat, longitude: a.lng }))}
              strokeColor="rgba(22,75,59,0.55)"
              strokeWidth={2}
              lineDashPattern={[2, 6]}
            />
          ) : null}
          {activities.map((a, i) => {
            const sel = a.id === selectedId;
            return (
              <Marker
                key={a.id}
                coordinate={{ latitude: a.lat, longitude: a.lng }}
                tracksViewChanges={tracking}
                onPress={interactive ? () => onSelect?.(a.id) : undefined}
              >
                <View style={[styles.marker, sel && styles.markerOn]}>
                  <Text style={styles.markerText}>{label(i)}</Text>
                </View>
              </Marker>
            );
          })}
        </MapView>
        <Text style={styles.disclaimer}>
          {legs.length
            ? "Routes from Google · colored by walk, transit or drive"
            : showOrder ? "Illustrative map · dashed line shows visit order, not directions" : "Illustrative map · numbers show the day of each stop"}
        </Text>
      </View>
    </MapBoundary>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.lg, overflow: "hidden", backgroundColor: "#ecefe4" },
  fill: { flex: 1 },
  marker: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.forest, borderWidth: 3, borderColor: colors.white, alignItems: "center", justifyContent: "center" },
  markerOn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.coral },
  markerText: { color: colors.white, fontFamily: font.bodyBold, fontSize: 12 },
  disclaimer: { position: "absolute", left: 8, bottom: 8, backgroundColor: "rgba(255,254,250,0.9)", color: colors.muted, borderRadius: 999, overflow: "hidden", paddingVertical: 4, paddingHorizontal: 8, fontFamily: font.bodySemi, fontSize: 11 },
});
