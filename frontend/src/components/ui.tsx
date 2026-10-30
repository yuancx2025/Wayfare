import { useEffect, type ReactNode } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "./Icon";
import { colors, font, radius, space, touch } from "@/theme";

export function TopBar({ title, subtitle, onBack, action }: { title: string; subtitle?: string; onBack?: () => void; action?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.topbar, { paddingTop: insets.top + space[2] }]}>
      {onBack ? (
        <Pressable style={styles.iconButton} onPress={onBack} accessibilityRole="button" accessibilityLabel="Go back">
          <Icon name="back" />
        </Pressable>
      ) : <View style={styles.topSpacer} />}
      <View style={styles.topTitleWrap}>
        <Text style={styles.topTitle}>{title}</Text>
        {subtitle ? <Text style={styles.topSubtitle}>{subtitle}</Text> : null}
      </View>
      <View style={styles.topAction}>{action}</View>
    </View>
  );
}

type ButtonProps = {
  children: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  icon?: IconName;
  trailing?: IconName;
  full?: boolean;
};

export function Button({ children, onPress, disabled, variant = "primary", icon, trailing, full = true }: ButtonProps) {
  const iconColor = variant === "primary" || variant === "danger" ? colors.white : colors.forest;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        full && styles.btnFull,
        variant === "primary" && styles.btnPrimary,
        variant === "secondary" && styles.btnSecondary,
        variant === "ghost" && styles.btnGhost,
        variant === "danger" && styles.btnDanger,
        disabled && styles.btnDisabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      {icon ? <Icon name={icon} size={19} color={disabled ? "rgba(255,255,255,0.8)" : iconColor} /> : null}
      <Text style={[styles.btnText, (variant === "secondary" || variant === "ghost") && styles.btnTextDark, disabled && styles.btnTextDisabled]}>{children}</Text>
      {trailing ? <Icon name={trailing} size={19} color={iconColor} /> : null}
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, hint }: { label: string; selected: boolean; onPress: () => void; hint?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipOn]}
    >
      {selected ? <Icon name="check" size={15} color={colors.forest} /> : null}
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
      {hint ? <Text style={[styles.chipHint, selected && styles.chipTextOn]}>{hint}</Text> : null}
    </Pressable>
  );
}

export function ChipGroup<T extends string>({ options, value, onChange, multi = false, columns }: {
  options: { value: T; label: string; hint?: string }[];
  value: T | T[];
  onChange: (v: any) => void;
  multi?: boolean;
  columns?: number;
}) {
  const selected = (v: T) => (Array.isArray(value) ? value.includes(v) : value === v);
  const toggle = (v: T) => {
    if (!multi) return onChange(v);
    const arr = value as T[];
    onChange(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  };
  return (
    <View style={styles.chipWrap} accessibilityRole={multi ? "none" : "radiogroup"}>
      {options.map((o) => (
        <View key={o.value} style={columns ? { width: columns === 3 ? "31%" : "48%" } : undefined}>
          <Chip label={o.label} hint={o.hint} selected={selected(o.value)} onPress={() => toggle(o.value)} />
        </View>
      ))}
    </View>
  );
}

export function PrefSection({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <View style={styles.prefSection}>
      <Text style={styles.prefTitle}>{title}</Text>
      {hint ? <Text style={styles.prefHint}>{hint}</Text> : null}
      {children}
    </View>
  );
}

export function FormField({ icon, label, error, children }: { icon: IconName; label: string; error?: string; children: ReactNode }) {
  return (
    <View>
      <View style={[styles.fieldBox, error ? styles.fieldErrorBox : null]}>
        <View style={styles.fieldIcon}><Icon name={icon} color={colors.forest} /></View>
        <View style={styles.fieldCopy}>
          <Text style={styles.fieldLabel}>{label}</Text>
          {children}
        </View>
      </View>
      {error ? (
        <View style={styles.fieldError}>
          <Icon name="alert" size={14} color={colors.coralInk} />
          <Text style={styles.fieldErrorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function FieldInput(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor="#a5ada9"
      {...props}
      style={[styles.fieldInput, props.style]}
    />
  );
}

export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}><Icon name={icon} size={28} color={colors.forest} /></View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
      {action}
    </View>
  );
}

export function SectionHeading({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionHeading}>
      <View style={{ flex: 1 }}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {action}
    </View>
  );
}

export function BottomSheet({ open, onClose, title, children, footer }: {
  open: boolean; onClose: () => void; title?: string; children: ReactNode; footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetLayer}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space[4]) }]}>
          <View style={styles.grabber} />
          {title ? (
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{title}</Text>
              <Pressable style={styles.iconButtonSmall} onPress={onClose} accessibilityLabel="Close">
                <Icon name="x" size={18} />
              </Pressable>
            </View>
          ) : null}
          <View style={styles.sheetBody}>{children}</View>
          {footer ? <View style={styles.sheetFooter}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

export function Toast({ message }: { message: string | null }) {
  const insets = useSafeAreaInsets();
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(-12);
  useEffect(() => {
    opacity.value = withTiming(message ? 1 : 0, { duration: 200 });
    translateY.value = withTiming(message ? 0 : -12, { duration: 200 });
  }, [message, opacity, translateY]);
  const anim = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: translateY.value }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.toast, { top: insets.top + space[2] }, anim]} accessibilityRole="alert" accessibilityLiveRegion="polite">
      {message ? (
        <>
          <Icon name="check" size={17} color={colors.sand} />
          <Text style={styles.toastText}>{message}</Text>
        </>
      ) : null}
    </Animated.View>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <View style={styles.spinner} accessibilityRole="progressbar" accessibilityLabel={label ?? "Loading"}>
      <ActivityIndicator color={colors.forest} />
      {label ? <Text style={styles.spinnerText}>{label}</Text> : null}
    </View>
  );
}

export function ErrorLine({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <View style={styles.fieldError} accessibilityRole="alert">
      <Icon name="alert" size={14} color={colors.coralInk} />
      <Text style={styles.fieldErrorText}>{message}</Text>
    </View>
  );
}

export function Eyebrow({ children, light = false }: { children: string; light?: boolean }) {
  return <Text style={[styles.eyebrow, light && styles.eyebrowLight]}>{children}</Text>;
}

const styles = StyleSheet.create({
  topbar: { paddingHorizontal: space[4], paddingBottom: space[2], flexDirection: "row", alignItems: "center", gap: space[2] },
  topSpacer: { width: touch },
  topTitleWrap: { flex: 1, alignItems: "center" },
  topTitle: { fontFamily: font.displaySemi, fontSize: 16, color: colors.ink, textAlign: "center" },
  topSubtitle: { marginTop: 2, fontFamily: font.bodyMedium, fontSize: 12, color: colors.muted, textAlign: "center" },
  topAction: { width: touch, alignItems: "flex-end" },
  iconButton: { width: touch, height: touch, borderRadius: touch / 2, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center", backgroundColor: colors.white },
  iconButtonSmall: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center", backgroundColor: colors.white },
  btn: { minHeight: 54, paddingHorizontal: space[5], borderRadius: radius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  btnFull: { alignSelf: "stretch" },
  btnPrimary: { backgroundColor: colors.forest },
  btnSecondary: { backgroundColor: colors.mint, minHeight: touch },
  btnGhost: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.line },
  btnDanger: { backgroundColor: colors.coralInk },
  btnDisabled: { backgroundColor: "#9fb2aa" },
  pressed: { transform: [{ scale: 0.98 }] },
  btnText: { fontFamily: font.bodyBold, fontSize: 15, color: colors.white },
  btnTextDark: { color: colors.forest },
  btnTextDisabled: { color: "rgba(255,255,255,0.85)" },
  chip: { minHeight: touch, paddingHorizontal: space[3], borderRadius: 999, borderWidth: 1.5, borderColor: "#d8dcd7", backgroundColor: colors.white, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, flexWrap: "wrap" },
  chipOn: { borderColor: colors.forest, backgroundColor: colors.mint },
  chipText: { fontFamily: font.bodySemi, fontSize: 14, color: colors.ink },
  chipTextOn: { color: colors.forest },
  chipHint: { width: "100%", textAlign: "center", color: colors.muted, fontFamily: font.bodyMedium, fontSize: 11 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  prefSection: { paddingVertical: space[4], borderTopWidth: 1, borderTopColor: "#e0e2dc" },
  prefTitle: { fontFamily: font.displaySemi, fontSize: 16, color: colors.ink },
  prefHint: { marginTop: 2, marginBottom: space[3], color: colors.muted, fontFamily: font.body, fontSize: 13 },
  fieldBox: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: space[3], paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.white },
  fieldErrorBox: { borderColor: colors.coral },
  fieldIcon: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.mint, alignItems: "center", justifyContent: "center" },
  fieldCopy: { flex: 1, flexShrink: 1 },
  fieldLabel: { color: colors.muted, fontFamily: font.bodyBold, fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase" },
  fieldInput: { minHeight: 28, padding: 0, fontFamily: font.bodySemi, fontSize: 16, color: colors.ink },
  fieldError: { marginTop: 6, marginHorizontal: 4, flexDirection: "row", alignItems: "flex-start", gap: 6 },
  fieldErrorText: { flex: 1, color: colors.coralInk, fontFamily: font.bodySemi, fontSize: 13 },
  empty: { marginHorizontal: space[5], padding: space[6], borderRadius: radius.xl, backgroundColor: colors.cream, alignItems: "center", gap: space[3] },
  emptyIcon: { width: 64, height: 64, borderRadius: 22, backgroundColor: colors.mint, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontFamily: font.display, fontSize: 20, color: colors.ink, textAlign: "center" },
  emptyBody: { color: colors.muted, fontFamily: font.body, fontSize: 15, lineHeight: 22, textAlign: "center" },
  sectionHeading: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: space[3], marginBottom: space[3] },
  eyebrow: { color: colors.muted, fontFamily: font.bodyBold, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" },
  eyebrowLight: { color: "rgba(255,255,255,0.7)" },
  sectionTitle: { fontFamily: font.display, fontSize: 20, color: colors.ink },
  sheetLayer: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(12,24,20,0.42)" },
  sheet: { maxHeight: "86%", backgroundColor: colors.paper, borderTopLeftRadius: 26, borderTopRightRadius: 26 },
  grabber: { width: 40, height: 5, borderRadius: 999, backgroundColor: "#d5d9d4", alignSelf: "center", marginTop: 10 },
  sheetHeader: { paddingHorizontal: space[5], paddingVertical: space[2], flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sheetTitle: { fontFamily: font.displaySemi, fontSize: 18, color: colors.ink, flex: 1 },
  sheetBody: { paddingHorizontal: space[5], paddingBottom: space[4] },
  sheetFooter: { paddingHorizontal: space[5], paddingTop: space[3], borderTopWidth: 1, borderTopColor: colors.line },
  toast: { position: "absolute", alignSelf: "center", zIndex: 60, flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 999, backgroundColor: colors.ink },
  toastText: { color: colors.white, fontFamily: font.bodySemi, fontSize: 14 },
  spinner: { padding: space[5], alignItems: "center", gap: space[2] },
  spinnerText: { alignSelf: "stretch", color: colors.muted, fontFamily: font.body, fontSize: 14, lineHeight: 20, textAlign: "center" },
});
