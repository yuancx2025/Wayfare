import { useState } from "react";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { AuthField, PasswordInput } from "@/components/auth/AuthField";
import { Button } from "@/components/ui";

export default function SignUpScreen() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <AuthScreen section="Create your account" title="Start planning." intro="Your trips will sync across your devices.">
      <AuthField
        label="Name"
        placeholder="Your name"
        value={name}
        onChangeText={setName}
        autoComplete="name"
        textContentType="name"
      />
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
        placeholder="At least 8 characters"
        value={password}
        onChangeText={setPassword}
        autoComplete="new-password"
        textContentType="newPassword"
      />
      {/* TODO: submit with Clerk's signUp.password(), then send the email code. */}
      <Button disabled>Create account</Button>
    </AuthScreen>
  );
}
