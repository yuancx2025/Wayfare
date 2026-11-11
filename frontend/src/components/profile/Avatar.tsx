import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import type { AvatarPresetId, AvatarView } from "@/domain/avatar";
import { Icon, type IconName } from "@/components/Icon";
import { colors, font } from "@/theme";

export const AVATAR_PRESETS: Record<AvatarPresetId, { label: string; icon: IconName; background: string; color: string }> = {
  plane: { label: "Plane", icon: "plane", background: colors.forest, color: colors.sand },
  compass: { label: "Compass", icon: "compass", background: colors.mint, color: colors.forest },
  map: { label: "Map", icon: "map", background: colors.sand, color: colors.forestDark },
  leaf: { label: "Leaf", icon: "leaf", background: colors.forestDark, color: colors.mint },
  train: { label: "Train", icon: "train", background: colors.coral, color: colors.white },
  food: { label: "Food", icon: "utensils", background: colors.cream, color: colors.coralInk },
};

/** Profile picture: a photo, a preset icon, or initials. `avatar` is null while it is still loading. */
export function Avatar({ avatar, initials, size = 64 }: { avatar: AvatarView | null; initials: string; size?: number }) {
  // A photo that fails to render falls back to initials; picking a new one (new URI) tries again.
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const frame = { width: size, height: size, borderRadius: Math.round(size * 0.34) };

  if (!avatar) {
    return <View style={[styles.box, frame, { backgroundColor: colors.mint }]} />;
  }
  if (avatar.kind === "photo" && avatar.uri !== failedUri) {
    return (
      <Image
        source={{ uri: avatar.uri }}
        style={[frame, { backgroundColor: colors.mint }]}
        contentFit="cover"
        onError={() => setFailedUri(avatar.uri)}
        accessibilityLabel="Profile photo"
      />
    );
  }
  if (avatar.kind === "preset") {
    const preset = AVATAR_PRESETS[avatar.presetId];
    return (
      <View style={[styles.box, frame, { backgroundColor: preset.background }]} accessibilityLabel={`${preset.label} avatar`}>
        <Icon name={preset.icon} size={Math.round(size * 0.46)} color={preset.color} />
      </View>
    );
  }
  return (
    <View style={[styles.box, frame, { backgroundColor: colors.forest }]}>
      <Text style={[styles.initials, { fontSize: Math.round(size * 0.31) }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  initials: { color: colors.sand, fontFamily: font.display },
});
