import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { colors, font, space, touch } from "@/theme";

interface AuthScreenProps {
  /** Small uppercase label next to the back arrow, e.g. "Sign in to your account". */
  section: string;
  title: string;
  intro?: string;
  children: ReactNode;
  /** Pinned to the bottom on tall screens; scrolls with the form on short ones. */
  footer?: ReactNode;
}

/** Shared layout for every authentication screen. */
export function AuthScreen({ section, title, intro, children, footer }: AuthScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // No back arrow when sign-in is the first screen of the app; shown when opened from Profile or another auth screen.
  const canGoBack = router.canGoBack();

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space[4], paddingBottom: insets.bottom + space[5] }]}
      >
        <View style={styles.nav}>
          {canGoBack ? (
            <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8} accessibilityRole="button" accessibilityLabel="Go back">
              <Icon name="back" size={22} />
            </Pressable>
          ) : null}
          <Text style={styles.section}>{section}</Text>
        </View>

        <Text style={styles.title} accessibilityRole="header">{title}</Text>
        {intro ? <Text style={styles.intro}>{intro}</Text> : null}

        <View style={styles.body}>{children}</View>

        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function TextLink({ children, onPress, align = "center" }: { children: string; onPress: () => void; align?: "center" | "right" }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.link, align === "right" && styles.linkRight]}
      hitSlop={6}
      accessibilityRole="link"
    >
      <Text style={styles.linkText}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { flexGrow: 1, paddingHorizontal: space[5] },
  nav: { minHeight: touch, flexDirection: "row", alignItems: "center", gap: space[1] },
  back: { width: 32, height: touch, justifyContent: "center" },
  section: { color: colors.muted, fontFamily: font.bodyBold, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" },
  title: { marginTop: space[5], fontFamily: font.display, fontSize: 32, color: colors.ink },
  intro: { marginTop: space[2], fontFamily: font.body, fontSize: 15, lineHeight: 22, color: colors.muted },
  body: { marginTop: space[6], gap: space[4] },
  // marginTop "auto" pushes the footer to the bottom when there is spare room.
  footer: { marginTop: "auto", paddingTop: space[6], gap: space[3] },
  link: { minHeight: 44, justifyContent: "center", alignSelf: "center" },
  linkRight: { alignSelf: "flex-end" },
  linkText: { color: colors.forest, fontFamily: font.bodyBold, fontSize: 14 },
});
