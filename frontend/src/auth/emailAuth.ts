import { useSignIn, useSignUp } from "@clerk/expo";
import { describeAuthError, type AuthFormError } from "./errors";

type SignIn = ReturnType<typeof useSignIn>["signIn"];

/**
 * Why the code screen is open:
 * - signup: confirm the email of a new account.
 * - new-device: Clerk's Device Trust asks for a code when an account signs in on a new device.
 * - reset: confirm a password reset.
 */
export type CodePurpose = "signup" | "new-device" | "reset";

/** The next step after a successful call; errors are returned instead of thrown. */
export type AuthStep =
  | { kind: "signed-in" }
  | { kind: "enter-code" }
  | { kind: "new-password" }
  | { kind: "error"; error: AuthFormError };

const fail = (error: unknown): AuthStep => ({ kind: "error", error: describeAuthError(error) });

const UNFINISHED: AuthStep = {
  kind: "error",
  error: { field: "form", message: "We couldn't finish signing you in. Please try again." },
};

/**
 * Moves a sign-in attempt forward based on its status.
 * Activating the session is enough to leave the auth screens: the route guards in app/_layout.tsx react to it.
 */
export async function continueSignIn(signIn: SignIn): Promise<AuthStep> {
  if (signIn.status === "complete") {
    const { error } = await signIn.finalize();
    return error ? fail(error) : { kind: "signed-in" };
  }

  const canUseEmailCode = signIn.supportedSecondFactors.some((factor) => factor.strategy === "email_code");
  if (signIn.status === "needs_client_trust" || (signIn.status === "needs_second_factor" && canUseEmailCode)) {
    const { error } = await signIn.mfa.sendEmailCode();
    return error ? fail(error) : { kind: "enter-code" };
  }

  if (signIn.status === "needs_second_factor") {
    return {
      kind: "error",
      error: { field: "form", message: "This account uses two-step verification, which Wayfare doesn't support yet." },
    };
  }
  return UNFINISHED;
}

/** Verify and resend actions for the shared six-digit code screen. */
export function useEmailCode(purpose: CodePurpose) {
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();

  const verify = async (code: string): Promise<AuthStep> => {
    if (purpose === "signup") {
      const { error } = await signUp.verifications.verifyEmailCode({ code });
      if (error) return fail(error);
      if (signUp.status !== "complete") return UNFINISHED;
      const { error: finalizeError } = await signUp.finalize();
      return finalizeError ? fail(finalizeError) : { kind: "signed-in" };
    }

    if (purpose === "new-device") {
      const { error } = await signIn.mfa.verifyEmailCode({ code });
      return error ? fail(error) : continueSignIn(signIn);
    }

    // A correct reset code moves the attempt to "needs_new_password".
    const { error } = await signIn.resetPasswordEmailCode.verifyCode({ code });
    if (error) return fail(error);
    return signIn.status === "needs_new_password" ? { kind: "new-password" } : UNFINISHED;
  };

  /** Returns an error to show, or null when a new code was sent. */
  const resend = async (): Promise<AuthFormError | null> => {
    const { error } =
      purpose === "signup"
        ? await signUp.verifications.sendEmailCode()
        : purpose === "new-device"
          ? await signIn.mfa.sendEmailCode()
          : await signIn.resetPasswordEmailCode.sendCode();
    return error ? describeAuthError(error) : null;
  };

  return { verify, resend };
}
