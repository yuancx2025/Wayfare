import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { goBackToProfile } from "@/lib/back";
import { useStore, errorMessage } from "@/state/store";
import { prefsEqual } from "@/domain/logic/labels";
import type { Preferences } from "@/domain/types";
import PreferencesForm from "@/components/PreferencesForm";
import { Button, ErrorLine, TopBar } from "@/components/ui";
import { RemoteSpinner } from "@/components/RemoteSpinner";
import { Icon } from "@/components/Icon";
import { colors, font, space } from "@/theme";

export default function ProfilePreferences() {
  const { hydrated, loadError, defaultPrefs, refresh } = useStore();

  if (!hydrated || loadError) {
    return (
      <View style={styles.screen}>
        <TopBar title="Travel preferences" onBack={goBackToProfile} />
        <View style={styles.status}>
          {!hydrated ? <RemoteSpinner label="Loading your preferences" /> : (
            <>
              <ErrorLine message={loadError} />
              <Button icon="refresh" onPress={() => { void refresh(); }}>Try again</Button>
            </>
          )}
        </View>
      </View>
    );
  }

  return <PreferencesEditor defaultPrefs={defaultPrefs} />;
}

type PreferencesEditorState = { draft: Preferences; baseline: Preferences };

function PreferencesEditor({ defaultPrefs }: { defaultPrefs: Preferences }) {
  const { saveDefaultPrefs, showToast } = useStore();
  const [editor, setEditor] = useState<PreferencesEditorState>(() => ({
    draft: defaultPrefs, baseline: defaultPrefs,
  }));
  const { draft } = editor;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = !prefsEqual(draft, defaultPrefs);
  const noInterests = draft.interests.length === 0;

  // New defaults replace an untouched draft; an edited draft is kept.
  if (editor.baseline !== defaultPrefs) {
    setEditor({
      draft: prefsEqual(editor.draft, editor.baseline) ? defaultPrefs : editor.draft,
      baseline: defaultPrefs,
    });
  }

  const changeDraft = (next: Preferences) => {
    setError(null);
    setEditor((current) => ({ ...current, draft: next }));
  };

  const discard = () => {
    setError(null);
    setEditor({ draft: defaultPrefs, baseline: defaultPrefs });
  };

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
      <TopBar title="Travel preferences" onBack={goBackToProfile} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.note}>
          <Icon name="alert" size={14} color={colors.muted} />
          <Text style={styles.noteText}>{"Used to prefill new trips. Saving won't change trips you've already planned."}</Text>
        </View>
        <PreferencesForm value={draft} onChange={changeDraft} />
        {noInterests ? <Text style={styles.warn}>Pick at least one interest.</Text> : null}
        <ErrorLine message={error} />
      </ScrollView>
      <View style={styles.footer}>
        <View style={styles.row}>
          {dirty ? (
            <View style={{ flex: 1 }}>
              <Button variant="secondary" disabled={saving} onPress={discard}>Discard</Button>
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
  status: { flex: 1, justifyContent: "center", padding: space[5], gap: space[4] },
  content: { padding: space[5], paddingBottom: space[6] },
  note: { flexDirection: "row", gap: 6, marginBottom: space[2] },
  noteText: { flex: 1, color: colors.muted, fontFamily: font.body, fontSize: 13, lineHeight: 18 },
  warn: { marginTop: space[3], color: colors.coralInk, fontFamily: font.bodySemi, fontSize: 13 },
  footer: { padding: space[4], borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.paper },
  row: { flexDirection: "row", gap: space[3] },
});
