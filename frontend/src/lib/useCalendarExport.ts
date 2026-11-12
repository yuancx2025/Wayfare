import { useCallback, useState } from "react";
import { Linking, Platform } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthSession } from "@/auth/session";
import { classifyTrip } from "@/domain/logic/tripHistory";
import type { Trip } from "@/domain/types";
import {
  calendarNamespace, calendarProblem, calendarStatus, removeTripFromCalendar, requestCalendarPermission, syncTripToCalendar,
  type CalendarProblem, type CalendarStatus, type SyncResult,
} from "@/lib/calendar";

/**
 * Calendar export state for one trip. `status` is null until the stored export record has been read. A missing
 * permission is reported in `problem`, not thrown; calendar write failures reject so the caller can show them.
 */
export function useCalendarExport(trip: Trip | undefined, today: string) {
  const { mode, userId } = useAuthSession();
  const namespace = calendarNamespace(mode, userId);
  const queryClient = useQueryClient();
  // The native calendar module does not exist on web.
  const supported = Platform.OS !== "web";
  const canExport = supported && !!trip && classifyTrip(trip, today) !== "past";
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<CalendarProblem | null>(null);

  // Keyed by the trip object, so an adjusted itinerary is compared again.
  const queryKey = ["calendarStatus", namespace, trip];
  const query = useQuery({
    queryKey,
    queryFn: () => calendarStatus(trip!, namespace),
    enabled: supported && !!trip,
  });
  const status: CalendarStatus | null = query.data ?? null;
  const setStatus = (next: CalendarStatus) => queryClient.setQueryData(queryKey, next);

  const sync = async (): Promise<SyncResult | null> => {
    if (!trip) return null;
    setBusy(true);
    setProblem(null);
    try {
      const issue = calendarProblem(await requestCalendarPermission());
      if (issue) {
        setProblem(issue);
        return null;
      }
      const result = await syncTripToCalendar(trip, namespace);
      setStatus("synced");
      return result;
    } finally {
      setBusy(false);
    }
  };

  const remove = async (): Promise<number> => {
    if (!trip) return 0;
    setBusy(true);
    try {
      const removed = await removeTripFromCalendar(trip.id, namespace);
      setStatus("none");
      return removed;
    } finally {
      setBusy(false);
    }
  };

  return {
    supported,
    canExport,
    status,
    busy,
    problem,
    exported: status === "synced" || status === "stale",
    refresh: useCallback(() => { void query.refetch(); }, [query]),
    sync,
    remove,
    clearProblem: () => setProblem(null),
    openSettings: () => { void Linking.openSettings(); },
  };
}

export type CalendarExport = ReturnType<typeof useCalendarExport>;
