import { useQuery } from "@tanstack/react-query";
import type { DayRoute, Trip } from "@/domain/types";
import { useApi } from "@/lib/api";

/** Route geometry for one day. Only the backend has it; offline maps join stops in visit order. */
export function useDayRoute(trip: Trip | undefined, day: number): DayRoute | null {
  const api = useApi();
  const query = useQuery({
    queryKey: ["dayRoute", trip?.id, trip?.version ?? 0, day],
    queryFn: () => api.dayRoute(trip!.id, day),
    enabled: api.mode === "remote" && !!trip,
    staleTime: Infinity,
    retry: false,
  });
  return query.data ?? null;
}
