import { useState } from "react";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { AuthField } from "@/components/auth/AuthField";
import { Button } from "@/components/ui";

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");

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
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
      />
      {/* TODO: send the code with Clerk's signIn.resetPasswordEmailCode.sendCode(). */}
      <Button disabled>Send code</Button>
    </AuthScreen>
  );
}
