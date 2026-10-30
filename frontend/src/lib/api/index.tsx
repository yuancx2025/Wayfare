import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useAuth } from "@clerk/expo";
import { API_URL } from "@/config";
import { useAuthSession } from "@/auth/session";
import { createLocalApi } from "./local";
import { createRemoteApi } from "./remote";
import { ApiError, type Api } from "./types";

export type { Api, GenerateOptions } from "./types";
export { ApiError } from "./types";

const ApiContext = createContext<Api | null>(null);

/** Fails every call, so an account never silently saves to this device. */
function missingBackendApi(): Api {
  const fail = () => Promise.reject(new ApiError(0, "Accounts need the Wayfare server. Set EXPO_PUBLIC_API_URL in frontend/.env and restart Expo."));
  return {
    mode: "remote",
    capabilities: fail, getMe: fail, updateProfile: fail, getPreferences: fail, savePreferences: fail,
    listTrips: fail, getTrip: fail, deleteTrip: fail, generateTrip: fail,
    autocomplete: fail, resolveDestination: fail, listDestinations: fail, placeDetails: fail, dayRoute: fail,
    alternatives: fail, propose: fail, applyProposal: fail,
    imageUrl: (src) => src,
  };
}

/**
 * Accounts talk to the backend with their Clerk session. Guests, and the sign-in screens, use the on-device planner
 * and bundled catalog even when EXPO_PUBLIC_API_URL is set. Must sit under ClerkProvider and AuthSessionProvider.
 */
export function ApiProvider({ children }: { children: ReactNode }) {
  // Clerk keeps `getToken` stable, so the client changes only when the identity does.
  const { getToken } = useAuth();
  const { mode, userId, endSession } = useAuthSession();
  const account = mode === "account" ? userId : null;

  const api = useMemo(() => {
    if (!account) return createLocalApi();
    if (!API_URL) return missingBackendApi();
    return createRemoteApi(API_URL, getToken, endSession);
  }, [account, getToken, endSession]);

  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export function useApi(): Api {
  const api = useContext(ApiContext);
  if (!api) throw new Error("useApi outside ApiProvider");
  return api;
}
