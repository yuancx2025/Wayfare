import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useGoogleSignIn } from "@/auth/googleAuth";
import type { AuthFormError } from "@/auth/errors";
import { Button } from "@/components/ui";
import { colors, font, space } from "@/theme";

export function OrDivider() {
  return (
    <View style={styles.or}>
      <View style={styles.rule} />
      <Text style={styles.orText}>or</Text>
      <View style={styles.rule} />
    </View>
  );
}

/** Google sign-in for the sign-in and create-account screens. Closing the sheet reports nothing. */
export function GoogleSignIn({
  disabled,
  onBusy,
  onError,
}: {
  disabled?: boolean;
  onBusy: (busy: boolean) => void;
  onError: (error: AuthFormError | null) => void;
}) {
  const signInWithGoogle = useGoogleSignIn();
  const [busy, setBusy] = useState(false);

  const onPress = async () => {
    setBusy(true);
    onBusy(true);
    onError(null);
    try {
      const step = await signInWithGoogle();
      if (step.kind === "error") onError(step.error);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  };

  return (
    <>
      <OrDivider />
      <Button variant="secondary" icon="google" onPress={onPress} disabled={disabled || busy}>
        {busy ? "Opening Google…" : "Continue with Google"}
      </Button>
    </>
  );
}

const styles = StyleSheet.create({
  or: { flexDirection: "row", alignItems: "center", gap: space[3] },
  rule: { flex: 1, height: 1, backgroundColor: colors.line },
  orText: { color: colors.muted, fontFamily: font.body, fontSize: 13 },
});
