// Offline itinerary planner, used when no API is configured. The backend version (backend/app/planner) adds
// Google Places candidates, LLM curation and Routes API travel times on top of the same scheduling rules.
import type { Activity, Day, Destination, Leg, Place, Preferences, Slot, Trip, TripDraft } from "../types";
import { addDays, daysBetween } from "../lib/format";
import { foodLabel, interestLabel } from "./labels";

const R = 6371;
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);

export function legBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }, transport: Preferences["transport"], walkCapMin?: number): Leg {
  const km = distanceKm(a, b) * 1.3; // street factor
  const walkMin = km * 12;
  let mode: Leg["mode"];
  if (transport === "driving") mode = km < 0.6 ? "walk" : "drive";
  else if (transport === "walking") mode = km < 2.5 ? "walk" : "transit";
  else if (transport === "transit") mode = km < 0.9 ? "walk" : "transit";
  else mode = km < 1.4 ? "walk" : "transit";
  if (mode === "walk" && walkCapMin !== undefined && walkMin > walkCapMin) mode = transport === "driving" ? "drive" : "transit";
  const raw = mode === "walk" ? walkMin : mode === "transit" ? 8 + km * 2.6 : 6 + km * 2.2;
  return { mode, minutes: round5(raw), km: Math.round(km * 10) / 10 };
}

const SLOT_FLOOR: Partial<Record<Slot, number>> = { lunch: 12 * 60, dinner: 18 * 60 + 30, evening: 19 * 60 + 30 };

/** Recompute travel legs and start times. Used after generation and every adjustment. */
export function retimeDay(day: Day, prefs: Preferences): Day {
  let t = day.startMin;
  const activities = day.activities.map((a, i, arr) => {
    let legIn: Leg | undefined;
    if (i > 0) {
      legIn = legBetween(arr[i - 1], a, prefs.transport, day.walkCapMin);
      t += legIn.minutes + day.bufferMin;
    }
    const floor = a.slot ? SLOT_FLOOR[a.slot] : undefined;
    if (floor && t < floor) t = floor;
    const startMin = Math.ceil(t / 5) * 5;
    t = startMin + a.durationMin;
    return { ...a, startMin, legIn };
  });
  return { ...day, activities };
}

export function scorePlace(pl: Place, prefs: Preferences) {
  let s = 0;
  if (pl.category !== "food" && prefs.interests.includes(pl.category)) s += 3;
  if (pl.food?.some((f) => prefs.food.includes(f))) s += 3;
  if (pl.price) {
    if (prefs.budget === "budget") s -= (pl.price - 1) * 1.5;
    if (prefs.budget === "premium") s += (pl.price - 1) * 0.8;
    if (prefs.budget === "moderate" && pl.price === 3) s -= 1;
  }
  return s;
}

export function whyFor(pl: Place, prefs: Preferences, slot?: Slot): string {
  const reasons: string[] = [];
  if (pl.category !== "food" && prefs.interests.includes(pl.category)) reasons.push(`You picked ${interestLabel(pl.category).toLowerCase()}`);
  const food = pl.food?.find((f) => prefs.food.includes(f));
  if (food) reasons.push(`matches your taste for ${foodLabel(food).toLowerCase()}`);
  if (pl.price === 1 && prefs.budget === "budget") reasons.push("easy on a budget");
  if (pl.price === 3 && prefs.budget === "premium") reasons.push("a premium pick for your budget");
  if (slot === "lunch") reasons.push("timed as a midday break");
  if (slot === "evening") reasons.push("best after dark");
  if (prefs.pace === "relaxed" && pl.category !== "food") reasons.push("unhurried visit for a relaxed pace");
  if (!reasons.length) reasons.push(`rounds out the day near ${pl.area}`);
  const text = reasons.slice(0, 2).join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1) + ".";
}

const durationFor = (pl: Place, prefs: Preferences) =>
  round5(pl.durationMin * (pl.category === "food" ? 1 : prefs.pace === "relaxed" ? 1.2 : prefs.pace === "packed" ? 0.85 : 1));

export function toActivity(tripId: string, dayIndex: number, pl: Place, prefs: Preferences, slot?: Slot): Activity {
  return {
    id: `${tripId}-d${dayIndex}-${pl.id}`, placeId: pl.id, name: pl.name, category: pl.category, area: pl.area,
    lat: pl.lat, lng: pl.lng, startMin: 0, durationMin: durationFor(pl, prefs), description: pl.description,
    why: whyFor(pl, prefs, slot), slot,
  };
}

const THEMES: Record<string, string> = {
  culture: "History & landmarks", nature: "Gardens & green space", museums: "Art & museums",
  shopping: "Markets & neighborhoods", architecture: "Skylines & design", nightlife: "Evening alleys", food: "A day of tasting",
};

export function describeDay(activities: Activity[]) {
  const count = (key: (a: Activity) => string, list: Activity[]) => {
    const m = new Map<string, number>();
    list.forEach((a) => m.set(key(a), (m.get(key(a)) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  };
  const sights = activities.filter((a) => a.category !== "food");
  const cat = count((a) => a.category, sights.length ? sights : activities)[0] ?? "food";
  return { theme: THEMES[cat], areas: count((a) => a.area, activities).slice(0, 2).join(" & ") };
}

function nearestNeighbor<T extends { lat: number; lng: number }>(items: T[]): T[] {
  if (items.length < 3) return items;
  const rest = [...items];
  const out = [rest.shift()!];
  while (rest.length) {
    const last = out[out.length - 1];
    let bi = 0;
    rest.forEach((r, i) => { if (distanceKm(last, r) < distanceKm(last, rest[bi])) bi = i; });
    out.push(rest.splice(bi, 1)[0]);
  }
  return out;
}

export function buildTrip(id: string, dest: Destination, draft: TripDraft): Trip {
  const prefs = draft.prefs;
  const n = daysBetween(draft.startDate, draft.endDate) + 1;
  const sightsPerDay = { relaxed: 2, balanced: 3, packed: 4 }[prefs.pace];
  const withDinner = prefs.pace === "packed" || (prefs.pace === "balanced" && prefs.interests.includes("food"));

  const byScore = (list: Place[]) => list.map((pl, i) => ({ pl, s: scorePlace(pl, prefs) - i * 0.001 })).sort((a, b) => b.s - a.s).map((x) => x.pl);
  const sights = byScore(dest.places.filter((pl) => pl.category !== "food")).slice(0, n * sightsPerDay);
  const foods = byScore(dest.places.filter((pl) => pl.category === "food"));
  const { lat: cLat, lng: cLng } = dest.center;
  sights.sort((a, b) => Math.atan2(a.lat - cLat, a.lng - cLng) - Math.atan2(b.lat - cLat, b.lng - cLng));

  const usedFood = new Set<string>();
  const days: Day[] = [];
  let cursor = 0;
  for (let d = 0; d < n; d++) {
    const size = Math.floor(sights.length / n) + (d < sights.length % n ? 1 : 0);
    const group = sights.slice(cursor, cursor + size);
    cursor += size;
    const centroid = group.length
      ? { lat: group.reduce((s, g) => s + g.lat, 0) / group.length, lng: group.reduce((s, g) => s + g.lng, 0) / group.length }
      : dest.center;
    const pickFood = (meal: boolean) => {
      const pool = foods.filter((f) => !usedFood.has(f.id) && (!meal || f.food?.some((x) => x !== "cafes")));
      const best = [...pool].sort((a, b) => (scorePlace(b, prefs) - distanceKm(centroid, b) * 0.8) - (scorePlace(a, prefs) - distanceKm(centroid, a) * 0.8))[0];
      if (best) usedFood.add(best.id);
      return best;
    };
    const evening = group.filter((g) => g.category === "nightlife");
    const daytime = nearestNeighbor(group.filter((g) => g.category !== "nightlife"));
    const acts: Activity[] = daytime.map((pl) => toActivity(id, d, pl, prefs));
    const lunch = pickFood(true);
    if (lunch) acts.splice(Math.ceil(acts.length / 2), 0, toActivity(id, d, lunch, prefs, "lunch"));
    if (withDinner) {
      const dinner = pickFood(true);
      if (dinner) acts.push(toActivity(id, d, dinner, prefs, "dinner"));
    }
    evening.forEach((pl) => acts.push(toActivity(id, d, pl, prefs, "evening")));
    const { theme, areas } = describeDay(acts);
    const base: Day = {
      index: d, date: addDays(draft.startDate, d), theme, areas,
      startMin: prefs.pace === "relaxed" ? 600 : prefs.pace === "packed" ? 510 : 555,
      bufferMin: prefs.pace === "relaxed" ? 25 : prefs.pace === "packed" ? 5 : 15,
      activities: acts,
    };
    days.push(retimeDay(base, prefs));
  }

  return {
    id, destinationId: dest.id, destination: dest.name, country: dest.country, image: dest.image,
    startDate: draft.startDate, endDate: draft.endDate, travelers: draft.travelers, prefs, days,
    adjusted: false, createdAt: Date.now(), isFavorite: false, visited: false,
  };
}

export class GenerationError extends Error {}
