import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState, Linking } from "react-native";
import * as Location from "expo-location";
import { withTimeout } from "@/lib/withTimeout";

export type LocationPermission = "checking" | "undetermined" | "granted" | "denied" | "blocked";

export interface LocationPermissionState {
  permission: LocationPermission;
  /** The user granted approximate location only (iOS "Precise: Off", Android coarse). */
  approximate: boolean;
  /** Shows the system prompt when it still can. Never reads a position. */
  request: () => Promise<LocationPermission>;
  openSettings: () => void;
}

const CHECK_TIMEOUT_MS = 5000;

function toPermission(r: Location.LocationPermissionResponse): LocationPermission {
  if (r.granted) return "granted";
  if (r.status === "undetermined") return "undetermined";
  return r.canAskAgain ? "denied" : "blocked";
}

const Ctx = createContext<LocationPermissionState | null>(null);

/**
 * Whether Wayfare may read the location, checked silently at launch and whenever the app returns
 * to the foreground (the user may have changed it in Settings). Checking never prompts or reads GPS.
 */
export function LocationPermissionProvider({ children }: { children: ReactNode }) {
  const [permission, setPermission] = useState<LocationPermission>("checking");
  const [approximate, setApproximate] = useState(false);
  const mounted = useRef(true);

  const apply = useCallback((r: Location.LocationPermissionResponse) => {
    const next = toPermission(r);
    if (mounted.current) {
      setPermission(next);
      setApproximate(r.ios?.accuracy === "reduced" || r.android?.accuracy === "coarse");
    }
    return next;
  }, []);

  const check = useCallback(async () => {
    try {
      return apply(await withTimeout(Location.getForegroundPermissionsAsync(), CHECK_TIMEOUT_MS));
    } catch {
      // Unknown: behave as if never asked, so tapping still shows the prompt.
      if (mounted.current) setPermission("undetermined");
      return "undetermined" as const;
    }
  }, [apply]);

  useEffect(() => {
    mounted.current = true;
    void check();
    const sub = AppState.addEventListener("change", (state) => { if (state === "active") void check(); });
    return () => { mounted.current = false; sub.remove(); };
  }, [check]);

  const request = useCallback(async () => {
    const current = await check();
    if (current === "granted" || current === "blocked") return current;
    // No timeout: the system prompt waits for the user.
    return apply(await Location.requestForegroundPermissionsAsync());
  }, [apply, check]);

  const openSettings = useCallback(() => { void Linking.openSettings(); }, []);

  const value = useMemo<LocationPermissionState>(
    () => ({ permission, approximate, request, openSettings }),
    [permission, approximate, request, openSettings],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLocationPermission() {
  const p = useContext(Ctx);
  if (!p) throw new Error("useLocationPermission outside LocationPermissionProvider");
  return p;
}
