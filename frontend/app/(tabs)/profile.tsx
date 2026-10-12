import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "@/state/store";
import { prefsEqual } from "@/domain/logic/labels";
import type { Preferences } from "@/domain/types";
import PreferencesForm from "@/components/PreferencesForm";
import { Button } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { colors, font, radius, space } from "@/theme";

export default function Profile() {
  const { defaultPrefs, saveDefaultPrefs, me, showToast } = useStore();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<Preferences>(defaultPrefs);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(defaultPrefs), [defaultPrefs]);
  const dirty = !prefsEqual(draft, defaultPrefs);
  const stats = me?.stats ?? { trips: 0, daysPlanned: 0, countries: 0 };
  const since = [me?.travelingSince ? `Traveling since ${me.travelingSince}` : null, me?.home].filter(Boolean).join(" · ");

  const save = async () => {
    setSaving(true);
    try {
      await saveDefaultPrefs(draft);
      showToast("Default preferences saved");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Couldn't save your preferences");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + space[5], paddingBottom: space[6] }}>
        <View style={styles.head}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{me?.initials ?? ""}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{me?.name ?? "Your profile"}</Text>
            {since ? <Text style={styles.muted}>{since}</Text> : null}
          </View>
        </View>
        <View style={styles.stats}>
          <Stat n={stats.trips} label={stats.trips === 1 ? "trip" : "trips"} />
          <Stat n={stats.daysPlanned} label="days planned" />
          <Stat n={stats.countries} label={stats.countries === 1 ? "country" : "countries"} />
        </View>
        <View style={styles.section}>
          <Text style={styles.eyebrow}>Default travel preferences</Text>
          <View style={styles.note}>
            <Icon name="alert" size={14} color={colors.muted} />
            <Text style={styles.noteText}>Used to prefill new trips. Saving won't change trips you've already planned.</Text>
          </View>
          <PreferencesForm value={draft} onChange={setDraft} />
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <View style={styles.row}>
          {dirty ? <View style={{ flex: 1 }}><Button variant="secondary" onPress={() => setDraft(defaultPrefs)}>Discard</Button></View> : null}
          <View style={{ flex: 1 }}>
            <Button
              icon="check"
              disabled={!dirty || saving || draft.interests.length === 0}
              onPress={() => { void save(); }}
            >
              {saving ? "Saving…" : dirty ? "Save preferences" : "Saved"}
            </Button>
          </View>
        </View>
      </View>
    </View>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statN}>{n}</Text>
      <Text style={styles.statL}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  head: { flexDirection: "row", alignItems: "center", gap: space[4], paddingHorizontal: space[5], marginBottom: space[5] },
  avatar: { width: 64, height: 64, borderRadius: 22, backgroundColor: colors.forest, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.sand, fontFamily: font.display, fontSize: 20 },
  name: { fontFamily: font.display, fontSize: 26, color: colors.ink },
  muted: { color: colors.muted, fontFamily: font.body, fontSize: 14 },
  stats: { marginHorizontal: space[5], borderRadius: radius.lg, backgroundColor: colors.cream, flexDirection: "row", paddingVertical: space[4] },
  stat: { flex: 1, alignItems: "center", borderLeftWidth: 1, borderLeftColor: colors.line },
  statN: { fontFamily: font.display, fontSize: 22, color: colors.forest },
  statL: { color: colors.muted, fontFamily: font.body, fontSize: 12 },
  section: { paddingHorizontal: space[5], marginTop: space[5] },
  eyebrow: { color: colors.muted, fontFamily: font.bodyBold, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" },
  note: { flexDirection: "row", gap: 6, marginTop: 6, marginBottom: space[2] },
  noteText: { flex: 1, color: colors.muted, fontFamily: font.body, fontSize: 13, lineHeight: 18 },
  footer: { padding: space[4], borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.paper },
  row: { flexDirection: "row", gap: space[3] },
});
