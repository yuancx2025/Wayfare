import { daysBetween } from "../lib/format";
import type { TripPhase } from "../types";

export interface DatedTrip {
  id: string;
  startDate: string;
  endDate: string;
}

export interface TripSection<T> {
  title: string;
  phase: TripPhase;
  data: T[];
}

const TITLES: Record<TripPhase, string> = {
  ongoing: "Ongoing",
  upcoming: "Upcoming",
  past: "Past",
};

/** Inclusive of the start and end dates. `YYYY-MM-DD` strings compare in calendar order. */
export function classifyTrip(trip: { startDate: string; endDate: string }, today: string): TripPhase {
  if (trip.endDate < today) return "past";
  if (trip.startDate > today) return "upcoming";
  return "ongoing";
}

export function statusLabel(trip: { startDate: string; endDate: string }, today: string): string {
  const phase = classifyTrip(trip, today);
  if (phase === "past") return "Past";
  if (phase === "ongoing") return "Happening now";
  const days = daysBetween(today, trip.startDate);
  return days <= 1 ? "Tomorrow" : `In ${days} days`;
}

function byDateThenId<T extends { id: string }>(dateOf: (trip: T) => string, direction: 1 | -1) {
  return (a: T, b: T) => {
    if (dateOf(a) < dateOf(b)) return -direction;
    if (dateOf(a) > dateOf(b)) return direction;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  };
}

/** Ordered Ongoing, Upcoming, Past sections. Empty sections are omitted. The input array is not reordered. */
export function groupTrips<T extends DatedTrip>(list: readonly T[], today: string): TripSection<T>[] {
  const grouped: Record<TripPhase, T[]> = { ongoing: [], upcoming: [], past: [] };
  for (const trip of list) grouped[classifyTrip(trip, today)].push(trip);
  grouped.ongoing.sort(byDateThenId((trip) => trip.endDate, 1));
  grouped.upcoming.sort(byDateThenId((trip) => trip.startDate, 1));
  grouped.past.sort(byDateThenId((trip) => trip.endDate, -1));
  return (["ongoing", "upcoming", "past"] as const)
    .filter((phase) => grouped[phase].length > 0)
    .map((phase) => ({ title: TITLES[phase], phase, data: grouped[phase] }));
}

export function recentPast<T extends DatedTrip>(list: readonly T[], today: string, n = 3): T[] {
  return groupTrips(list, today).find((section) => section.phase === "past")?.data.slice(0, n) ?? [];
}
