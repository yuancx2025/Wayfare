import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useStore } from "@/state/store";
import { api } from "@/lib/api";
import { daysBetween, fmtRange, plural } from "@/domain/lib/format";
import { prefsEqual, prefsSentence } from "@/domain/logic/labels";
import PreferencesForm from "@/components/PreferencesForm";
import { Button, TopBar } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { colors, font, radius, space, touch } from "@/theme";

export default function Preferences() {
  const { draft, updateDraft, defaultPrefs } = useStore();
  const router = useRouter();
  const place = draft.destination.split(",")[0].trim();
  const n = daysBetween(draft.startDate, draft.endDate) + 1;
  const changed = !prefsEqual(draft.prefs, defaultPrefs);
  const noInterests = draft.prefs.interests.length === 0;

  return (
    <View style={styles.screen}>
      <TopBar title="Preferences" subtitle="Step 2 of 3" onBack={() => router.back()} />
      <View style={styles.progress}><View style={styles.on} /><View style={styles.on} /><View style={styles.off} /></View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.pageTitle}>Make it yours</Text>
        <Text style={styles.subtitle}>
          Prefilled from your profile. {changed ? "Changes here apply to this trip only." : "Adjust anything for this trip."}
        </Text>
        {changed ? (
          <Pressable style={styles.reset} onPress={() => updateDraft({ prefs: { ...defaultPrefs, interests: [...defaultPrefs.interests], food: [...defaultPrefs.food] } })}>
            <Icon name="refresh" size={15} color={colors.forest} />
            <Text style={styles.resetText}>Reset to profile defaults</Text>
          </Pressable>
        ) : null}
        <PreferencesForm value={draft.prefs} onChange={(prefs) => updateDraft({ prefs })} />
        <View style={styles.summary}>
          <Text style={styles.summaryEyebrow}>What will shape your plan</Text>
          <Text style={styles.summaryTitle}>{place} · {plural(n, "day")}</Text>
          <Text style={styles.summaryDates}>{fmtRange(draft.startDate, draft.endDate)} · {draft.travelers === 1 ? "1 traveler" : `${draft.travelers} travelers`}</Text>
          <Text style={styles.summaryBody}>{prefsSentence(draft.prefs)}</Text>
          {noInterests ? <Text style={styles.warn}>Pick at least one interest so we know what to plan around.</Text> : null}
        </View>
        {__DEV__ && api.mode === "local" ? (
          <View style={styles.devRow}>
            <Switch
              value={draft.simulateFailure}
              onValueChange={(v) => updateDraft({ simulateFailure: v })}
              trackColor={{ false: "#c5ccc7", true: colors.forest }}
            />
            <Text style={styles.devText}>Prototype: simulate a failed generation</Text>
          </View>
        ) : null}
      </ScrollView>
      <View style={styles.footer}>
        <Button icon="spark" disabled={noInterests} onPress={() => router.push("/create/generating")}>Generate Trip</Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  progress: { height: 3, flexDirection: "row", gap: 3, backgroundColor: colors.line },
  on: { flex: 1, backgroundColor: colors.forest },
  off: { flex: 1, backgroundColor: "transparent" },
  content: { padding: space[5], paddingBottom: space[6] },
  pageTitle: { fontFamily: font.display, fontSize: 30, color: colors.ink },
  subtitle: { marginTop: space[2], marginBottom: space[4], color: colors.muted, fontFamily: font.body, fontSize: 15, lineHeight: 22 },
  reset: { minHeight: touch, flexDirection: "row", alignItems: "center", gap: 6 },
  resetText: { color: colors.forest, fontFamily: font.bodyBold },
  summary: { marginTop: space[3], padding: space[5], borderRadius: radius.lg, backgroundColor: colors.forest, gap: 6 },
  summaryEyebrow: { color: colors.sand, fontFamily: font.bodyBold, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" },
  summaryTitle: { color: colors.white, fontFamily: font.display, fontSize: 20 },
  summaryDates: { color: "rgba(255,255,255,0.65)", fontFamily: font.body, fontSize: 13 },
  summaryBody: { color: "rgba(255,255,255,0.85)", fontFamily: font.body, fontSize: 14, lineHeight: 20 },
  warn: { color: "#ffc9bd", fontFamily: font.bodySemi, fontSize: 13 },
  devRow: { minHeight: touch, marginTop: space[4], flexDirection: "row", alignItems: "center", gap: 10 },
  devText: { flex: 1, color: colors.muted, fontFamily: font.body, fontSize: 13 },
  footer: { padding: space[4], borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: "rgba(246,244,239,0.96)" },
});
