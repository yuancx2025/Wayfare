import type { Category, Insights, Trip } from "../types";

/** Same rules as `trip_insights` on the server: a place counts once however many trips include it. */
export function tripInsights(trips: readonly Trip[]): Insights {
  const places = new Map<string, Category>();
  for (const trip of trips) for (const day of trip.days) for (const a of day.activities) places.set(a.placeId, a.category);
  const counts = new Map<Category, number>();
  for (const category of places.values()) counts.set(category, (counts.get(category) ?? 0) + 1);
  const topCategories = [...counts]
    .map(([category, n]) => ({ category, places: n }))
    .sort((a, b) => b.places - a.places || (a.category < b.category ? -1 : 1))
    .slice(0, 3);
  return {
    trips: trips.length,
    days: trips.reduce((n, t) => n + t.days.length, 0),
    stops: trips.reduce((n, t) => n + t.days.reduce((m, d) => m + d.activities.length, 0), 0),
    destinations: new Set(trips.map((t) => t.destinationId)).size,
    topCategories,
  };
}
