import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSignIn } from "@clerk/expo";
import { describeAuthError, messageFor, type AuthFormError } from "@/auth/errors";
import { checkEmail } from "@/auth/validation";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { AuthField } from "@/components/auth/AuthField";
import { Button, ErrorLine } from "@/components/ui";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { signIn } = useSignIn();
  // Pre-filled with whatever was typed on the sign-in screen.
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? "");
  const [error, setError] = useState<AuthFormError | null>(null);
  const [busy, setBusy] = useState(false);

  const onSend = async () => {
    const problem = checkEmail(email);
    if (problem) return setError(problem);

    setBusy(true);
    setError(null);
    try {
      // Start a sign-in attempt for this email, then ask Clerk to email a reset code.
      const created = await signIn.create({ identifier: email.trim() });
      if (created.error) return setError(describeAuthError(created.error));

      const sent = await signIn.resetPasswordEmailCode.sendCode();
      if (sent.error) return setError(describeAuthError(sent.error));

      router.push({ pathname: "/verify", params: { purpose: "reset", email: email.trim() } });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthScreen
      section="Reset your password"
      title="Forgot password?"
      intro="Enter your account email and we'll send you a 6-digit code."
    >
      <AuthField
        label="Email address"
        placeholder="you@example.com"
        value={email}
        onChangeText={setEmail}
        error={messageFor(error, "email")}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        onSubmitEditing={onSend}
        returnKeyType="send"
      />
      <Button onPress={onSend} disabled={busy}>{busy ? "Sending…" : "Send code"}</Button>
      <ErrorLine message={messageFor(error, "form")} />
    </AuthScreen>
  );
}
