/**
 * - loading: still reading the saved session; keep the splash screen up.
 * - account: a Clerk session is active; data lives in the cloud.
 * - guest: the user chose to plan without an account; data stays on this device.
 * - signedOut: neither; show the sign-in screen.
 */
export type AuthMode = "loading" | "account" | "guest" | "signedOut";

/** `guest` is null until the saved choice has been read from storage. */
export function resolveMode(clerkLoaded: boolean, signedIn: boolean, guest: boolean | null): AuthMode {
  if (clerkLoaded && signedIn) return "account";
  if (guest === null) return "loading";
  // Guests don't wait for Clerk, so guest mode opens even when Clerk can't be reached.
  if (guest) return "guest";
  if (!clerkLoaded) return "loading";
  return "signedOut";
}
