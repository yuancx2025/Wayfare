import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Linking } from "react-native";
import * as Location from "expo-location";

export type LocationStatus = "idle" | "locating" | "ready" | "denied" | "blocked" | "off" | "timeout" | "error";

export interface CurrentLocation {
  status: LocationStatus;
  position: { lat: number; lng: number } | null;
  /** The user granted approximate location only (iOS "Precise: Off", Android coarse). */
  approximate: boolean;
  /** Asks for permission on first use, then takes a single fix. Also serves as "refresh". */
  locate: () => Promise<void>;
  openSettings: () => void;
}

export const LOCATION_PROBLEMS: Partial<Record<LocationStatus, { title: string; body: string; settings?: boolean }>> = {
  denied: { title: "Location not shared", body: "Nearby places need your location. You can still search destinations above." },
  blocked: { title: "Location is off for Wayfare", body: "Allow location access for Wayfare in Settings, or keep searching destinations above.", settings: true },
  off: { title: "Location Services are off", body: "Turn on Location Services in your device settings, then try again. Destination search still works." },
  timeout: { title: "Couldn't find you in time", body: "Your device took too long to get a position. Try again, or search destinations above." },
  error: { title: "Couldn't get your location", body: "Something went wrong reading your position. Try again, or search destinations above." },
};

const FIX_TIMEOUT_MS = 15000;
const CHECK_TIMEOUT_MS = 5000;

class FixTimeout extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new FixTimeout()), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

const Ctx = createContext<CurrentLocation | null>(null);

/**
 * One foreground position, taken only when the user asks for it, shared by every screen.
 * The last fix lives in memory for this session; nothing watches location or stores it.
 */
export function LocationProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<LocationStatus>("idle");
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [approximate, setApproximate] = useState(false);
  const latest = useRef(0);
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  const locate = useCallback(async () => {
    const run = ++latest.current;
    const current = () => mounted.current && run === latest.current;
    setStatus("locating");
    try {
      if (!(await withTimeout(Location.hasServicesEnabledAsync(), CHECK_TIMEOUT_MS))) {
        if (current()) setStatus("off");
        return;
      }
      let perm = await withTimeout(Location.getForegroundPermissionsAsync(), CHECK_TIMEOUT_MS);
      // No timeout here: the system prompt waits for the user.
      if (!perm.granted && perm.canAskAgain) perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        if (current()) setStatus(perm.canAskAgain ? "denied" : "blocked");
        return;
      }
      const fix = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), FIX_TIMEOUT_MS);
      if (!current()) return;
      setPosition({ lat: fix.coords.latitude, lng: fix.coords.longitude });
      setApproximate(perm.ios?.accuracy === "reduced" || perm.android?.accuracy === "coarse");
      setStatus("ready");
    } catch (e) {
      if (current()) setStatus(e instanceof FixTimeout ? "timeout" : "error");
    }
  }, []);

  const openSettings = useCallback(() => { void Linking.openSettings(); }, []);

  const value = useMemo<CurrentLocation>(
    () => ({ status, position, approximate, locate, openSettings }),
    [status, position, approximate, locate, openSettings],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCurrentLocation() {
  const loc = useContext(Ctx);
  if (!loc) throw new Error("useCurrentLocation outside LocationProvider");
  return loc;
}
