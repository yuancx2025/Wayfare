import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useStore, errorMessage } from "@/state/store";
import { prefsEqual } from "@/domain/logic/labels";
import type { Preferences } from "@/domain/types";
import PreferencesForm from "@/components/PreferencesForm";
import { Button, ErrorLine, TopBar } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { colors, font, space } from "@/theme";

export default function ProfilePreferences() {
  const { defaultPrefs, saveDefaultPrefs, showToast } = useStore();
  const router = useRouter();
  const baseline = useRef(defaultPrefs);
  const [draft, setDraft] = useState<Preferences>(defaultPrefs);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = !prefsEqual(draft, defaultPrefs);
  const noInterests = draft.interests.length === 0;

  useEffect(() => {
    setDraft((current) => {
      const editing = !prefsEqual(current, baseline.current) && !prefsEqual(current, defaultPrefs);
      if (editing) return current;
      baseline.current = defaultPrefs;
      return defaultPrefs;
    });
  }, [defaultPrefs]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveDefaultPrefs(draft);
      showToast("Default preferences saved");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <TopBar title="Travel preferences" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.note}>
          <Icon name="alert" size={14} color={colors.muted} />
          <Text style={styles.noteText}>Used to prefill new trips. Saving won't change trips you've already planned.</Text>
        </View>
        <PreferencesForm value={draft} onChange={(prefs) => { setError(null); setDraft(prefs); }} />
        {noInterests ? <Text style={styles.warn}>Pick at least one interest.</Text> : null}
        <ErrorLine message={error} />
      </ScrollView>
      <View style={styles.footer}>
        <View style={styles.row}>
          {dirty ? (
            <View style={{ flex: 1 }}>
              <Button variant="secondary" onPress={() => { setError(null); setDraft(defaultPrefs); }}>Discard</Button>
            </View>
          ) : null}
          <View style={{ flex: 1 }}>
            <Button
              icon="check"
              disabled={!dirty || saving || noInterests}
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: space[5], paddingBottom: space[6] },
  note: { flexDirection: "row", gap: 6, marginBottom: space[2] },
  noteText: { flex: 1, color: colors.muted, fontFamily: font.body, fontSize: 13, lineHeight: 18 },
  warn: { marginTop: space[3], color: colors.coralInk, fontFamily: font.bodySemi, fontSize: 13 },
  footer: { padding: space[4], borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.paper },
  row: { flexDirection: "row", gap: space[3] },
});
