import type { Category, NearbyCategory, NearbyPlace, NearbyRequest, Place } from "@/domain/types";
import { distanceKm } from "./generate";

export const DEFAULT_NEARBY_RADIUS_M = 2000;
export const MAX_NEARBY_RADIUS_M = 5000;
const MAX_NEARBY_RESULTS = 20;

// Same groups as NEARBY_CATEGORIES in backend/app/features/discovery/schemas.py.
export const NEARBY_CATEGORIES: Record<NearbyCategory, Category[]> = {
  food: ["food"],
  attractions: ["culture", "museums", "nature", "architecture"],
  all: ["food", "culture", "museums", "nature", "architecture", "shopping", "nightlife"],
};

/** Closest places inside the radius by straight-line distance, nearest first. */
export function rankNearby(places: Place[], req: NearbyRequest): NearbyPlace[] {
  const radius = req.radiusM ?? DEFAULT_NEARBY_RADIUS_M;
  const wanted = NEARBY_CATEGORIES[req.category ?? "all"];
  return places
    .filter((p) => wanted.includes(p.category))
    .map((place) => ({ place, distanceM: Math.round(distanceKm(req, place) * 1000) }))
    .filter((n) => n.distanceM <= radius)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, MAX_NEARBY_RESULTS);
}
