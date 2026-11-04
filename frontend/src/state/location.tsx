import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as Location from "expo-location";
import { TimeoutError, withTimeout } from "@/lib/withTimeout";
import { useLocationPermission, type LocationPermission } from "./locationPermission";

/** State of the position fix only. Whether we may read it lives in `useLocationPermission`. */
export type FixStatus = "idle" | "locating" | "ready" | "off" | "timeout" | "error";

export interface LocationProblem { title: string; body: string; settings?: boolean }

export interface CurrentLocation {
  status: FixStatus;
  permission: LocationPermission;
  /** What to tell the user, from the permission first and then the last fix attempt. */
  problem?: LocationProblem;
  position: { lat: number; lng: number } | null;
  approximate: boolean;
  /** Asks for permission if needed, then takes a single fix. Also serves as "refresh". */
  locate: () => Promise<void>;
  openSettings: () => void;
}

const PROBLEMS: Record<"denied" | "blocked" | "off" | "timeout" | "error", LocationProblem> = {
  denied: { title: "Location not shared", body: "Nearby places need your location. You can still search destinations above." },
  blocked: { title: "Location is off for Wayfare", body: "Allow location access for Wayfare in Settings, or keep searching destinations above.", settings: true },
  off: { title: "Location Services are off", body: "Turn on Location Services in your device settings, then try again. Destination search still works." },
  timeout: { title: "Couldn't find you in time", body: "Your device took too long to get a position. Try again, or search destinations above." },
  error: { title: "Couldn't get your location", body: "Something went wrong reading your position. Try again, or search destinations above." },
};

const FIX_TIMEOUT_MS = 15000;
const CHECK_TIMEOUT_MS = 5000;

const Ctx = createContext<CurrentLocation | null>(null);

/**
 * One foreground position, taken only when the user asks for it, shared by every screen.
 * The last fix lives in memory for this session; nothing watches location or stores it.
 */
export function LocationProvider({ children }: { children: ReactNode }) {
  const { permission, approximate, request, openSettings } = useLocationPermission();
  const [status, setStatus] = useState<FixStatus>("idle");
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
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
      if ((await request()) !== "granted") {
        if (current()) setStatus("idle");
        return;
      }
      const fix = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), FIX_TIMEOUT_MS);
      if (!current()) return;
      setPosition({ lat: fix.coords.latitude, lng: fix.coords.longitude });
      setStatus("ready");
    } catch (e) {
      if (current()) setStatus(e instanceof TimeoutError ? "timeout" : "error");
    }
  }, [request]);

  // If access is revoked (e.g. in Settings), the last position stops being shown.
  const refused = permission === "denied" || permission === "blocked";
  const shownStatus: FixStatus = refused && status !== "locating" ? "idle" : status;
  const shownPosition = refused ? null : position;
  const problem = refused
    ? PROBLEMS[permission]
    : status === "off" || status === "timeout" || status === "error" ? PROBLEMS[status] : undefined;

  const value = useMemo<CurrentLocation>(
    () => ({ status: shownStatus, permission, problem, position: shownPosition, approximate, locate, openSettings }),
    [shownStatus, permission, problem, shownPosition, approximate, locate, openSettings],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCurrentLocation() {
  const loc = useContext(Ctx);
  if (!loc) throw new Error("useCurrentLocation outside LocationProvider");
  return loc;
}
