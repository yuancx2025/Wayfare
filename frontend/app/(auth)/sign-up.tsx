import { useState } from "react";
import { useRouter } from "expo-router";
import { useSignUp } from "@clerk/expo";
import { describeAuthError, messageFor, type AuthFormError } from "@/auth/errors";
import { checkEmail, checkName, checkPassword, MIN_PASSWORD_LENGTH } from "@/auth/validation";
import { AuthScreen, TextLink } from "@/components/auth/AuthScreen";
import { AuthField, PasswordInput } from "@/components/auth/AuthField";
import { Button, ErrorLine } from "@/components/ui";

export default function SignUpScreen() {
  const router = useRouter();
  const { signUp } = useSignUp();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<AuthFormError | null>(null);
  const [busy, setBusy] = useState(false);

  const onCreate = async () => {
    const problem = checkName(name) ?? checkEmail(email) ?? checkPassword(password, { isNew: true });
    if (problem) return setError(problem);

    setBusy(true);
    setError(null);
    try {
      // firstName requires "First and last name" to be enabled in the Clerk Dashboard (User & authentication).
      const created = await signUp.password({ emailAddress: email.trim(), password, firstName: name.trim() });
      if (created.error) return setError(describeAuthError(created.error));

      // Clerk doesn't email the code by itself; ask for it once the account is created.
      const sent = await signUp.verifications.sendEmailCode();
      if (sent.error) return setError(describeAuthError(sent.error));

      router.push({ pathname: "/verify", params: { purpose: "signup", email: email.trim() } });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthScreen
      section="Create your account"
      title="Start planning."
      intro="Your trips will sync across your devices."
      footer={<TextLink onPress={() => router.back()}>Already have an account? Sign in</TextLink>}
    >
      <AuthField
        label="Name"
        placeholder="Your name"
        value={name}
        onChangeText={setName}
        error={messageFor(error, "name")}
        autoComplete="name"
        textContentType="name"
      />
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
        placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
        value={password}
        onChangeText={setPassword}
        error={messageFor(error, "password")}
        autoComplete="new-password"
        textContentType="newPassword"
        onSubmitEditing={onCreate}
        returnKeyType="go"
      />
      <Button onPress={onCreate} disabled={busy}>{busy ? "Creating account…" : "Create account"}</Button>
      <ErrorLine message={messageFor(error, "form")} />
    </AuthScreen>
  );
}
