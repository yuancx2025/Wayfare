import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEmailCode, type CodePurpose } from "@/auth/emailAuth";
import { messageFor, type AuthFormError } from "@/auth/errors";
import { CODE_LENGTH } from "@/auth/validation";
import { AuthScreen, TextLink } from "@/components/auth/AuthScreen";
import { CodeInput } from "@/components/auth/CodeInput";
import { Icon } from "@/components/Icon";
import { Button, ErrorLine } from "@/components/ui";
import { colors, font, space } from "@/theme";

const COPY: Record<CodePurpose, { section: string; title: string; intro: (email: string) => string }> = {
  signup: {
    section: "Email verification",
    title: "Check your inbox.",
    intro: (email) => `We sent a 6-digit code to ${email}.`,
  },
  reset: {
    section: "Reset your password",
    title: "Check your inbox.",
    intro: (email) => `We sent a password reset code to ${email}.`,
  },
};

const isPurpose = (value: unknown): value is CodePurpose => value === "signup" || value === "reset";

export default function VerifyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ purpose?: string; email?: string }>();
  const purpose: CodePurpose = isPurpose(params.purpose) ? params.purpose : "signup";
  const email = params.email || "your email";
  const { verify, resend } = useEmailCode(purpose);

  const [code, setCode] = useState("");
  const [error, setError] = useState<AuthFormError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (value: string) => {
    if (value.length < CODE_LENGTH) return setError({ field: "code", message: `Enter all ${CODE_LENGTH} digits.` });

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const step = await verify(value);
      if (step.kind === "error") {
        setCode("");
        return setError(step.error);
      }
      // Replace so going back from the new-password screen doesn't return to a used code.
      if (step.kind === "new-password") router.replace("/reset-password");
      // "signed-in": the route guards move the user into the app.
    } finally {
      setBusy(false);
    }
  };

  const onChangeCode = (value: string) => {
    setCode(value);
    setError(null);
    // Submit as soon as all digits are in, whether typed, pasted, or autofilled.
    if (value.length === CODE_LENGTH && !busy) void submit(value);
  };

  const onResend = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const failure = await resend();
      if (failure) return setError(failure);
      setCode("");
      setNotice("We sent a new code.");
    } finally {
      setBusy(false);
    }
  };

  const copy = COPY[purpose];
  return (
    <AuthScreen
      section={copy.section}
      title={copy.title}
      intro={copy.intro(email)}
      art={
        <View style={styles.art}>
          <Icon name="mail" size={34} color={colors.forest} />
        </View>
      }
    >
      <CodeInput value={code} onChange={onChangeCode} error={messageFor(error, "code")} />
      <Button onPress={() => submit(code)} disabled={busy}>{busy ? "Checking…" : "Verify and continue"}</Button>
      <ErrorLine message={messageFor(error, "form")} />
      {notice ? <Text style={styles.notice} accessibilityLiveRegion="polite">{notice}</Text> : null}
      <TextLink onPress={onResend} disabled={busy}>Didn&apos;t get it? Resend code</TextLink>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  art: { width: 72, height: 72, borderRadius: 22, backgroundColor: colors.mint, alignItems: "center", justifyContent: "center" },
  notice: { textAlign: "center", color: colors.forest, fontFamily: font.bodySemi, fontSize: 14, marginTop: -space[2] },
});
