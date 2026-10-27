import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@clerk/expo";
import { storage } from "@/lib/storage";

const GUEST_KEY = "wayfare.guest";

/**
 * - loading: still reading the saved session; keep the splash screen up.
 * - account: a Clerk session is active; data lives in the cloud.
 * - guest: the user chose to plan without an account; data stays on this device.
 * - signedOut: neither; show the sign-in screen.
 */
export type AuthMode = "loading" | "account" | "guest" | "signedOut";

interface AuthSession {
  mode: AuthMode;
  /** Clerk user id while signed in. */
  userId: string | null;
  continueAsGuest: () => Promise<void>;
}

const AuthSessionContext = createContext<AuthSession | null>(null);

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  // null until the saved choice has been read from storage.
  const [guest, setGuest] = useState<boolean | null>(null);

  useEffect(() => {
    storage.getItem(GUEST_KEY).then((value) => setGuest(value === "1"));
  }, []);

  // Signing in replaces guest mode, so a later sign-out returns to the sign-in screen.
  useEffect(() => {
    if (isSignedIn && guest) {
      void storage.removeItem(GUEST_KEY).then(() => setGuest(false));
    }
  }, [isSignedIn, guest]);

  const continueAsGuest = useCallback(async () => {
    await storage.setItem(GUEST_KEY, "1");
    setGuest(true);
  }, []);

  const mode = resolveMode(isLoaded, isSignedIn === true, guest);

  const value = useMemo<AuthSession>(
    () => ({ mode, userId: mode === "account" ? userId ?? null : null, continueAsGuest }),
    [mode, userId, continueAsGuest],
  );
  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

function resolveMode(clerkLoaded: boolean, signedIn: boolean, guest: boolean | null): AuthMode {
  if (clerkLoaded && signedIn) return "account";
  if (guest === null) return "loading";
  // Guests don't wait for Clerk, so guest mode opens even when Clerk can't be reached.
  if (guest) return "guest";
  if (!clerkLoaded) return "loading";
  return "signedOut";
}

export function useAuthSession() {
  const session = useContext(AuthSessionContext);
  if (!session) throw new Error("useAuthSession outside AuthSessionProvider");
  return session;
}
