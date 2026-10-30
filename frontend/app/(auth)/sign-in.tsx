import { useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { useRouter } from "expo-router";
import { useSignIn } from "@clerk/expo";
import { useAuthSession } from "@/auth/session";
import { continueSignIn } from "@/auth/emailAuth";
import { describeAuthError, messageFor, type AuthFormError } from "@/auth/errors";
import { checkEmail, checkPassword } from "@/auth/validation";
import { AuthScreen, TextLink } from "@/components/auth/AuthScreen";
import { AuthField, PasswordInput } from "@/components/auth/AuthField";
import { Button, ErrorLine } from "@/components/ui";
import { colors, font } from "@/theme";

export default function SignInScreen() {
  const router = useRouter();
  const { signIn } = useSignIn();
  const { mode, continueAsGuest } = useAuthSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<AuthFormError | null>(null);
  const [busy, setBusy] = useState(false);
  const [leavingAsGuest, setLeavingAsGuest] = useState(false);

  // Navigate only after guest mode is active; until then the app screens are still protected.
  useEffect(() => {
    if (leavingAsGuest && mode === "guest") router.replace("/");
  }, [leavingAsGuest, mode, router]);

  const onSignIn = async () => {
    const problem = checkEmail(email) ?? checkPassword(password);
    if (problem) return setError(problem);

    setBusy(true);
    setError(null);
    try {
      const { error: signInError } = await signIn.password({ emailAddress: email.trim(), password });
      if (signInError) return setError(describeAuthError(signInError));

      const step = await continueSignIn(signIn);
      if (step.kind === "error") return setError(step.error);
      // "signed-in": the route guards move the user into the app.
    } finally {
      setBusy(false);
    }
  };

  const onGuest = async () => {
    // Already a guest (opened from Profile): just return to where they were.
    if (mode === "guest") {
      router.back();
      return;
    }
    await continueAsGuest();
    setLeavingAsGuest(true);
  };

  return (
    <AuthScreen
      section="Sign in to your account"
      title="Welcome back."
      footer={
        <>
          <TextLink onPress={() => router.push("/sign-up")}>Create account</TextLink>
          <Button variant="ghost" onPress={onGuest} disabled={busy}>Continue as guest</Button>
          <Text style={styles.caption}>Trips stay on this device.</Text>
        </>
      }
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
      />
      <PasswordInput
        label="Password"
        placeholder="Enter your password"
        value={password}
        onChangeText={setPassword}
        error={messageFor(error, "password")}
        autoComplete="current-password"
        textContentType="password"
        onSubmitEditing={onSignIn}
        returnKeyType="go"
      />
      <TextLink align="right" onPress={() => router.push({ pathname: "/forgot-password", params: { email: email.trim() } })}>
        Forgot password?
      </TextLink>
      <Button onPress={onSignIn} disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
      <ErrorLine message={messageFor(error, "form")} />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  caption: { textAlign: "center", color: colors.muted, fontFamily: font.body, fontSize: 13 },
});
