import { useSignIn, useSignUp } from "@clerk/expo";
import { describeAuthError, type AuthFormError } from "./errors";

type SignIn = ReturnType<typeof useSignIn>["signIn"];

/**
 * Why the code screen is open:
 * - signup: confirm the email of a new account.
 * - reset: confirm a password reset.
 *
 * Ordinary sign-in does not use a code. That requires Device Trust to be turned off in the Clerk
 * Dashboard (User & authentication, then Password). A correct password then finishes the sign-in.
 */
export type CodePurpose = "signup" | "reset";

/** The next step after a successful call; errors are returned instead of thrown. */
export type AuthStep =
  | { kind: "signed-in" }
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
  // With Device Trust and two-step verification off, a password sign-in is "complete" or it failed.
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
        : await signIn.resetPasswordEmailCode.sendCode();
    return error ? describeAuthError(error) : null;
  };

  return { verify, resend };
}
