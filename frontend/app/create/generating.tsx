import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { randomUUID } from "expo-crypto";
import { useStore } from "@/state/store";
import { daysBetween, plural } from "@/domain/lib/format";
import { interestLabel, paceLabel, transportLabel } from "@/domain/logic/labels";
import { api } from "@/lib/api";
import { Button } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { colors, font, space } from "@/theme";

export default function Generating() {
  const { draft, putTrip, updateDraft } = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [error, setError] = useState("");
  const [step, setStep] = useState(0);
  const [attempt, setAttempt] = useState(0);
  // Shared across retries so a request that succeeded after the client gave up is replayed, not duplicated.
  const idempotencyKey = useRef(randomUUID());

  const place = draft.destination.split(",")[0].trim();
  const n = daysBetween(draft.startDate, draft.endDate) + 1;
  const messages = [
    `Finding ${draft.prefs.interests.slice(0, 2).map(interestLabel).join(" and ").toLowerCase() || "highlights"} spots in ${place || "your city"}`,
    `Grouping nearby places into ${plural(n, "day")}`,
    `Estimating ${transportLabel(draft.prefs.transport).toLowerCase()} time between stops`,
    `Pacing each day for a ${paceLabel(draft.prefs.pace).toLowerCase()} trip`,
    "Adding meals and breathing room",
  ];

  useEffect(() => {
    // Leaving the screen (Cancel or back) aborts the request.
    const ctrl = new AbortController();
    api.generateTrip(draft, {
      onStep: (i) => setStep(Math.min(i, messages.length - 1)),
      signal: ctrl.signal,
      idempotencyKey: idempotencyKey.current,
    })
      .then((trip) => {
        if (ctrl.signal.aborted) return;
        putTrip(trip, { isNew: true });
        // Return to Trips first so Back on the new trip has somewhere to go.
        router.dismissTo("/");
        router.push(`/trip/${trip.id}`);
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Something went wrong.");
        setStatus("error");
      });
    return () => ctrl.abort();
    // Restart only when the user retries. Retry updates the draft and `attempt` in one render, so `draft` is current here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  if (status === "error") {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + space[6] }]}>
        <View style={styles.body}>
          <View style={styles.errorIcon}><Icon name="alert" size={32} color={colors.forestDark} /></View>
          <Text style={styles.title}>{"We couldn't finish your plan"}</Text>
          <Text style={styles.copy}>{error} Your destination, dates and preferences are saved — nothing to re-enter.</Text>
          <View style={styles.actions}>
            <Button
              icon="refresh"
              onPress={() => {
                updateDraft({ simulateFailure: false });
                setStatus("loading");
                setStep(0);
                setAttempt((a) => a + 1);
              }}
            >
              Retry
            </Button>
            <Button variant="ghost" onPress={() => router.back()}>Edit preferences</Button>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space[6] }]} accessibilityState={{ busy: true }}>
      <ScrollView contentContainerStyle={styles.body}>
        <ActivityIndicator size="large" color={colors.sand} />
        <Text style={styles.kicker}>Planning {place} · {plural(n, "day")}</Text>
        <Text style={styles.title}>Building your itinerary</Text>
        <View style={styles.steps}>
          {messages.map((m, i) => (
            <View key={m} style={styles.step}>
              <View style={[styles.dot, i < step && styles.dotDone, i === step && styles.dotCurrent]}>
                {i < step ? <Icon name="check" size={13} color={colors.forestDark} /> : null}
              </View>
              <Text style={[styles.stepText, i < step && styles.stepDone, i === step && styles.stepCurrent]}>{m}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
      <PressCancel onPress={() => router.back()} />
    </View>
  );
}

function PressCancel({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.cancelWrap}>
      <Text style={styles.cancel} onPress={onPress}>Cancel</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.forestDark },
  body: { paddingHorizontal: space[6], alignItems: "center" },
  kicker: { marginTop: space[5], color: "rgba(255,255,255,0.7)", fontFamily: font.bodyBold, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" },
  title: { marginTop: space[2], marginBottom: space[5], color: colors.white, fontFamily: font.display, fontSize: 28, textAlign: "center" },
  copy: { color: "rgba(255,255,255,0.75)", fontFamily: font.body, fontSize: 15, lineHeight: 22, textAlign: "center" },
  steps: { alignSelf: "stretch", gap: 4 },
  step: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: 12 },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.38)", alignItems: "center", justifyContent: "center" },
  dotDone: { backgroundColor: colors.sand, borderColor: colors.sand },
  dotCurrent: { borderColor: colors.sand },
  stepText: { flex: 1, color: "rgba(255,255,255,0.38)", fontFamily: font.body, fontSize: 15 },
  stepDone: { color: "rgba(255,255,255,0.7)" },
  stepCurrent: { color: colors.white, fontFamily: font.bodySemi },
  actions: { alignSelf: "stretch", marginTop: space[6], gap: space[3] },
  errorIcon: { width: 72, height: 72, borderRadius: 24, backgroundColor: colors.sand, alignItems: "center", justifyContent: "center", marginBottom: space[4] },
  cancelWrap: { padding: space[4], alignItems: "center" },
  cancel: { color: "rgba(255,255,255,0.8)", fontFamily: font.bodyBold, fontSize: 15, minHeight: 48, textAlignVertical: "center" },
});
