import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { useAuth } from "@clerk/expo";
import { storage } from "@/lib/storage";
import { SESSION_ENDED } from "@/lib/api/remote";
import { resolveMode, type AuthMode } from "./mode";

export type { AuthMode } from "./mode";

const GUEST_KEY = "wayfare.guest";

interface AuthSession {
  mode: AuthMode;
  /** Clerk user id while signed in. */
  userId: string | null;
  continueAsGuest: () => Promise<void>;
  /** Why the user was sent back to sign-in, e.g. their session ended. Cleared by the next sign-in or guest choice. */
  notice: string | null;
  /** Signs out because Clerk or the API no longer accepts the session. */
  endSession: () => void;
}

const AuthSessionContext = createContext<AuthSession | null>(null);

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId, getToken, signOut } = useAuth();
  // null until the saved choice has been read from storage.
  const [guest, setGuest] = useState<boolean | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const ending = useRef(false);

  useEffect(() => {
    storage.getItem(GUEST_KEY).then((value) => setGuest(value === "1"));
  }, []);

  // Signing in replaces guest mode, so a later sign-out returns to the sign-in screen.
  useEffect(() => {
    if (isSignedIn && guest) {
      void storage.removeItem(GUEST_KEY).then(() => setGuest(false));
    }
  }, [isSignedIn, guest]);

  // A new sign-in clears the reason the previous session ended.
  const [wasSignedIn, setWasSignedIn] = useState(isSignedIn);
  if (isSignedIn !== wasSignedIn) {
    setWasSignedIn(isSignedIn);
    if (isSignedIn) setNotice(null);
  }
  useEffect(() => {
    if (isSignedIn) ending.current = false;
  }, [isSignedIn]);

  const continueAsGuest = useCallback(async () => {
    await storage.setItem(GUEST_KEY, "1");
    setNotice(null);
    setGuest(true);
  }, []);

  // Several requests can hit the dead session at once; sign out only once.
  const endSession = useCallback(() => {
    if (ending.current) return;
    ending.current = true;
    setNotice(SESSION_ENDED);
    void signOut();
  }, [signOut]);

  // Clerk refreshes the ~60 s token while the app runs. After time in the background, ask Clerk for a fresh one:
  // a revoked or expired session comes back empty.
  useEffect(() => {
    if (!isSignedIn) return;
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener("change", (next) => {
      const resumed = next === "active" && previous !== "active";
      previous = next;
      if (!resumed) return;
      getToken({ skipCache: true })
        .then((token) => { if (!token) endSession(); })
        // Offline is not a signed-out session; only Clerk rejecting it is.
        .catch((e: { status?: number }) => { if (e?.status === 401 || e?.status === 404) endSession(); });
    });
    return () => subscription.remove();
  }, [isSignedIn, getToken, endSession]);

  const mode = resolveMode(isLoaded, isSignedIn === true, guest);

  const value = useMemo<AuthSession>(
    () => ({ mode, userId: mode === "account" ? userId ?? null : null, continueAsGuest, notice, endSession }),
    [mode, userId, continueAsGuest, notice, endSession],
  );
  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession() {
  const session = useContext(AuthSessionContext);
  if (!session) throw new Error("useAuthSession outside AuthSessionProvider");
  return session;
}
