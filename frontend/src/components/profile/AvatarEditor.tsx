import { useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { AVATAR_PRESET_IDS, INITIALS_AVATAR, sameAvatar, type AvatarView } from "@/domain/avatar";
import { cameraAccess, pickAvatarPhoto } from "@/lib/avatarStorage";
import { useStore } from "@/state/store";
import { BottomSheet, Button, ErrorLine } from "@/components/ui";
import { Avatar, AVATAR_PRESETS } from "./Avatar";
import { colors, font, radius, space } from "@/theme";

type Busy = "picking" | "camera" | "saving" | null;

/**
 * Sheet for choosing a photo, preset, or initials. Changes stay in a draft until Save avatar; closing discards them.
 * Saves on its own, so it never touches the Edit Profile form.
 */
export function AvatarEditor({ open, onClose, initials }: { open: boolean; onClose: () => void; initials: string }) {
  const { avatar, saveAvatar } = useStore();
  const [draft, setDraft] = useState<AvatarView | null>(avatar);
  const [error, setError] = useState<string | null>(null);
  const [cameraBlocked, setCameraBlocked] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const lock = useRef(false);

  // Each opening starts from the saved avatar.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(avatar);
      setError(null);
      setCameraBlocked(false);
    }
  }

  const run = async (kind: Exclude<Busy, null>, task: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(kind);
    setError(null);
    setCameraBlocked(false);
    try {
      await task();
    } finally {
      lock.current = false;
      setBusy(null);
    }
  };

  const choosePhoto = () => run("picking", async () => {
    try {
      const uri = await pickAvatarPhoto();
      if (uri) setDraft({ kind: "photo", uri });
    } catch {
      setError("Couldn't open that photo. Try another one.");
    }
  });

  const takePhoto = () => run("camera", async () => {
    try {
      const access = await cameraAccess();
      if (access !== "granted") {
        setCameraBlocked(access === "blocked");
        setError(access === "blocked"
          ? "Camera access is off for Wayfare. Turn it on in Settings."
          : "Camera access wasn't allowed, so no photo was taken.");
        return;
      }
      const uri = await pickAvatarPhoto("camera");
      if (uri) setDraft({ kind: "photo", uri });
    } catch {
      // Devices without a camera end up here.
      setError("Couldn't open the camera. Choose a photo instead.");
    }
  });

  const save = () => run("saving", async () => {
    if (!draft) return;
    try {
      await saveAvatar(draft);
      onClose();
    } catch {
      setError("Couldn't save your avatar. Check your storage and try again.");
    }
  });

  const close = () => { if (!busy) onClose(); };
  const choose = (next: AvatarView) => { if (!busy) { setError(null); setCameraBlocked(false); setDraft(next); } };
  const unchanged = !draft || sameAvatar(draft, avatar);
  const options: { key: string; label: string; value: AvatarView }[] = [
    { key: "initials", label: "Initials", value: INITIALS_AVATAR },
    ...AVATAR_PRESET_IDS.map((presetId) => ({
      key: presetId, label: AVATAR_PRESETS[presetId].label, value: { kind: "preset", presetId } as AvatarView,
    })),
  ];

  return (
    <BottomSheet
      open={open}
      onClose={close}
      title="Change avatar"
      footer={(
        <Button icon="check" disabled={unchanged || !!busy} onPress={() => { void save(); }}>
          {busy === "saving" ? "Saving…" : "Save avatar"}
        </Button>
      )}
    >
      <View style={styles.body}>
        <Avatar avatar={draft} initials={initials} size={104} />
        <View style={styles.sources}>
          <Button variant="secondary" icon="image" full={false} disabled={!!busy} onPress={() => { void choosePhoto(); }}>
            {busy === "picking" ? "Opening photos…" : "Choose photo"}
          </Button>
          <Button variant="secondary" icon="camera" full={false} disabled={!!busy} onPress={() => { void takePhoto(); }}>
            {busy === "camera" ? "Opening camera…" : "Take photo"}
          </Button>
        </View>
        <Text style={styles.label}>Or pick one</Text>
        <View style={styles.grid}>
          {options.map(({ key, label, value }) => {
            const selected = sameAvatar(draft, value);
            return (
              <Pressable
                key={key}
                onPress={() => choose(value)}
                disabled={!!busy}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ selected, disabled: !!busy }}
                style={({ pressed }) => [styles.option, selected && styles.selected, pressed && styles.pressed]}
              >
                <Avatar avatar={value} initials={initials} size={48} />
              </Pressable>
            );
          })}
        </View>
        <ErrorLine message={error} />
        {cameraBlocked ? (
          <Button variant="secondary" full={false} onPress={() => { void Linking.openSettings(); }}>Open Settings</Button>
        ) : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { alignItems: "center", gap: space[4], paddingTop: space[2] },
  sources: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: space[2] },
  label: { alignSelf: "flex-start", color: colors.muted, fontFamily: font.bodySemi, fontSize: 13 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: space[2] },
  option: { padding: 3, borderRadius: radius.md, borderWidth: 2, borderColor: "transparent" },
  selected: { borderColor: colors.forest },
  pressed: { opacity: 0.7 },
});
