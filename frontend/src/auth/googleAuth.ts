import { useSSO } from "@clerk/expo/experimental";
import { describeAuthError, type AuthFormError } from "./errors";

/**
 * Native redirect Clerk sends the browser back to. It has to be listed under the instance's allowed
 * redirect URLs, and it matches the scheme in app.config.ts. Dev builds use this; Expo Go does not.
 */
export const GOOGLE_REDIRECT_URL = "travelcompanion://sso-callback";

export type GoogleStep =
  | { kind: "signed-in" }
  | { kind: "cancelled" }
  | { kind: "error"; error: AuthFormError };

const UNFINISHED: GoogleStep = {
  kind: "error",
  error: { field: "form", message: "We couldn't finish signing you in. Please try again." },
};

/** Closing the browser sheet is not a failure. Anything else without a session is. */
export function interpretGoogleSignIn(result: {
  createdSessionId: string | null;
  authSessionResult: { type: string } | null;
}): GoogleStep {
  if (result.createdSessionId) return { kind: "signed-in" };
  const type = result.authSessionResult?.type;
  if (type === "cancel" || type === "dismiss") return { kind: "cancelled" };
  return UNFINISHED;
}

/** Opens Google in a browser sheet. A completed session is activated inside `startSSOFlow`. */
export function useGoogleSignIn() {
  const { startSSOFlow } = useSSO();
  return async (): Promise<GoogleStep> => {
    try {
      const result = await startSSOFlow({ strategy: "oauth_google", redirectUrl: GOOGLE_REDIRECT_URL });
      return interpretGoogleSignIn(result);
    } catch (error) {
      return { kind: "error", error: describeAuthError(error) };
    }
  };
}
