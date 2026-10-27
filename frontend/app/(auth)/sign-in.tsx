import { useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { useRouter } from "expo-router";
import { useAuthSession } from "@/auth/session";
import { AuthScreen, TextLink } from "@/components/auth/AuthScreen";
import { AuthField, PasswordInput } from "@/components/auth/AuthField";
import { Button } from "@/components/ui";
import { colors, font } from "@/theme";

export default function SignInScreen() {
  const router = useRouter();
  const { mode, continueAsGuest } = useAuthSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [leavingAsGuest, setLeavingAsGuest] = useState(false);

  // Navigate only after guest mode is active; until then the app screens are still protected.
  useEffect(() => {
    if (leavingAsGuest && mode === "guest") router.replace("/");
  }, [leavingAsGuest, mode, router]);

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
          <Button variant="ghost" onPress={onGuest}>Continue as guest</Button>
          <Text style={styles.caption}>Trips stay on this device.</Text>
        </>
      }
    >
      <AuthField
        label="Email address"
        placeholder="you@example.com"
        value={email}
        onChangeText={setEmail}
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
        autoComplete="current-password"
        textContentType="password"
      />
      <TextLink align="right" onPress={() => router.push("/forgot-password")}>Forgot password?</TextLink>
      {/* TODO: submit with Clerk's signIn.password(). */}
      <Button disabled>Sign in</Button>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  caption: { textAlign: "center", color: colors.muted, fontFamily: font.body, fontSize: 13 },
});
