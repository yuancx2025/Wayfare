import { useState } from "react";
import { useRouter } from "expo-router";
import { useSignIn } from "@clerk/expo";
import { continueSignIn } from "@/auth/emailAuth";
import { describeAuthError, messageFor, type AuthFormError } from "@/auth/errors";
import { checkPassword, MIN_PASSWORD_LENGTH } from "@/auth/validation";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { PasswordInput } from "@/components/auth/AuthField";
import { Button, ErrorLine } from "@/components/ui";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { signIn } = useSignIn();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<AuthFormError | null>(null);
  const [busy, setBusy] = useState(false);

  const onSave = async () => {
    const problem = checkPassword(password, { isNew: true });
    if (problem) return setError(problem);

    setBusy(true);
    setError(null);
    try {
      // Also signs out any other device that was using the old password.
      const { error: submitError } = await signIn.resetPasswordEmailCode.submitPassword({ password, signOutOfOtherSessions: true });
      if (submitError) return setError(describeAuthError(submitError));

      // A successful reset signs the user in, unless Clerk wants a new-device code first.
      const step = await continueSignIn(signIn);
      if (step.kind === "error") return setError(step.error);
      if (step.kind === "enter-code") {
        router.push({ pathname: "/verify", params: { purpose: "new-device", email: signIn.identifier ?? "" } });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthScreen section="Reset your password" title="Choose a new password." intro="You'll be signed in once it's saved.">
      <PasswordInput
        label="New password"
        placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
        value={password}
        onChangeText={setPassword}
        error={messageFor(error, "password")}
        autoComplete="new-password"
        textContentType="newPassword"
        autoFocus
        onSubmitEditing={onSave}
        returnKeyType="done"
      />
      <Button onPress={onSave} disabled={busy}>{busy ? "Saving…" : "Save and sign in"}</Button>
      <ErrorLine message={messageFor(error, "form")} />
    </AuthScreen>
  );
}
