import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { todayISO } from "@/domain/lib/format";

/** The device's local calendar date, refreshed on focus, foreground, and the next midnight. */
export function useToday(): string {
  const [today, setToday] = useState(todayISO);
  const refresh = useCallback(() => {
    setToday((current) => {
      const next = todayISO();
      return next === current ? current : next;
    });
  }, []);

  useFocusEffect(useCallback(() => {
    refresh();
  }, [refresh]));

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      const nextMidnight = new Date();
      nextMidnight.setHours(24, 0, 0, 0);
      const delay = Math.max(nextMidnight.getTime() - Date.now(), 1000);
      timer = setTimeout(() => {
        refresh();
        arm();
      }, delay);
    };
    arm();
    return () => clearTimeout(timer);
  }, [refresh]);

  return today;
}
