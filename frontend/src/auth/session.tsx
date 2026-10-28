import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@clerk/expo";
import { storage } from "@/lib/storage";
import { resolveMode, type AuthMode } from "./mode";

export type { AuthMode } from "./mode";

const GUEST_KEY = "wayfare.guest";

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

export function useAuthSession() {
  const session = useContext(AuthSessionContext);
  if (!session) throw new Error("useAuthSession outside AuthSessionProvider");
  return session;
}
