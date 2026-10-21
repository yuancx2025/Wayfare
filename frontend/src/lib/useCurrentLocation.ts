import { useCallback, useEffect, useRef, useState } from "react";
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

/** One foreground position, only when the user asks for it. Nothing watches location in the background. */
export function useCurrentLocation(): CurrentLocation {
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

  return { status, position, approximate, locate, openSettings };
}
