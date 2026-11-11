import * as AuthSession from "expo-auth-session";
import { useSSO } from "@clerk/expo/experimental";
import { describeAuthError, type AuthFormError } from "./errors";

type StartSSOFlow = ReturnType<typeof useSSO>["startSSOFlow"];

/**
 * Where Clerk sends the browser back to: travelcompanion://sso-callback in a dev build, <origin>/sso-callback on web.
 * Both have to be listed under the instance's allowed redirect URLs. Expo Go is not supported.
 * Built on each press, because on web it depends on the page's current origin.
 */
export const googleRedirectUrl = () =>
  AuthSession.makeRedirectUri({ scheme: "travelcompanion", path: "sso-callback" });

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

let pending: Promise<GoogleStep> | null = null;

/** The Google sign-in still in progress, if any. The callback screen waits for it before leaving. */
export const pendingGoogleSignIn = () => pending;

/** Opens Google in a browser sheet. A completed session is activated inside `startSSOFlow`. */
export function signInWithGoogle(startSSOFlow: StartSSOFlow): Promise<GoogleStep> {
  const flow = (async (): Promise<GoogleStep> => {
    try {
      const result = await startSSOFlow({ strategy: "oauth_google", redirectUrl: googleRedirectUrl() });
      return interpretGoogleSignIn(result);
    } catch (error) {
      return { kind: "error", error: describeAuthError(error) };
    }
  })();
  pending = flow;
  void flow.finally(() => {
    if (pending === flow) pending = null;
  });
  return flow;
}

export function useGoogleSignIn() {
  const { startSSOFlow } = useSSO();
  return () => signInWithGoogle(startSSOFlow);
}
