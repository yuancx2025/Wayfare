// Lightweight, previewable day adjustments. Each returns a proposed Day plus a human-readable diff.
// Offline counterpart of backend/app/planner/adjust.py, used when no API is configured.
import type { Activity, Change, Day, Place, Proposal, Trip } from "../types";
import { getDestination } from "../data/places";
import { fmtTime } from "../lib/format";
import { LEG_LABEL } from "./labels";
import { describeDay, distanceKm, retimeDay, scorePlace, toActivity } from "./generate";

const finish = (day: Day, trip: Trip): Day => {
  const timed = retimeDay(day, trip.prefs);
  return { ...timed, ...describeDay(timed.activities) };
};

const usedPlaceIds = (trip: Trip) => new Set(trip.days.flatMap((d) => d.activities.map((a) => a.placeId)));

export function proposeAdjustment(trip: Trip, dayIndex: number, kind: "relaxed" | "less-walking" | "more-food"): Proposal {
  const day = trip.days[dayIndex];
  const changes: Change[] = [];

  if (kind === "relaxed") {
    let acts = day.activities;
    const removable = acts.filter((a) => !a.slot || a.slot === "evening");
    if (acts.length > 2 && removable.length > 1) {
      // Drop the stop that costs the most travel time.
      const cost = (a: Activity) => {
        const i = acts.indexOf(a);
        return (a.legIn?.minutes ?? 0) + (acts[i + 1]?.legIn?.minutes ?? 0) + a.durationMin * 0.2;
      };
      const drop = [...removable].sort((a, b) => cost(b) - cost(a))[0];
      acts = acts.filter((a) => a !== drop);
      changes.push({ type: "removed", text: `${drop.name} — frees about ${Math.round((cost(drop) + drop.durationMin * 0.8) / 5) * 5} min` });
    }
    const next = finish({ ...day, activities: acts, startMin: day.startMin + 30, bufferMin: day.bufferMin + 15 }, trip);
    changes.push({ type: "changed", text: `Start later: ${fmtTime(day.startMin)} → ${fmtTime(next.startMin)}` });
    changes.push({ type: "changed", text: "Extra 15 min of breathing room between stops" });
    return { day: next, changes };
  }

  if (kind === "less-walking") {
    const next = finish({ ...day, walkCapMin: 8 }, trip);
    next.activities.forEach((a) => {
      const before = day.activities.find((b) => b.id === a.id)?.legIn;
      if (before && a.legIn && before.mode !== a.legIn.mode) {
        changes.push({ type: "changed", text: `To ${a.name}: ${LEG_LABEL[before.mode]} ~${before.minutes} min → ${LEG_LABEL[a.legIn.mode]} ~${a.legIn.minutes} min` });
      }
    });
    if (!changes.length) return { day, changes: [] };
    return { day: next, changes };
  }

  // more-food: add an afternoon tasting stop close to the middle of the day.
  const dest = getDestination(trip.destinationId);
  const used = usedPlaceIds(trip);
  const lateIdx = day.activities.findIndex((a) => a.slot === "dinner" || a.slot === "evening");
  const mid = lateIdx >= 0 ? lateIdx : day.activities.length;
  const anchor = day.activities[mid - 1] ?? day.activities[0];
  const snackBonus = (pl: Place) => (pl.food?.some((f) => f === "cafes" || f === "street-food") ? 2 : 0);
  const rank = (pl: Place) => scorePlace(pl, trip.prefs) + snackBonus(pl) - distanceKm(anchor, pl);
  const candidates = dest.places.filter((pl) => pl.category === "food" && !used.has(pl.id));
  const pick = [...candidates].sort((a, b) => rank(b) - rank(a))[0];
  if (!pick) return { day, changes: [] };
  const snack = { ...toActivity(trip.id, dayIndex, pick, trip.prefs, "snack"), durationMin: Math.min(45, pick.durationMin) };
  const acts = [...day.activities];
  acts.splice(mid, 0, snack);
  const next = finish({ ...day, activities: acts }, trip);
  const placed = next.activities.find((a) => a.id === snack.id)!;
  changes.push({ type: "added", text: `${pick.name} at ${fmtTime(placed.startMin)} — ${pick.description}` });
  const later = next.activities[next.activities.length - 1];
  const prevLast = day.activities[day.activities.length - 1];
  if (later && prevLast && later.startMin !== prevLast.startMin) changes.push({ type: "changed", text: `Later stops shift by ~${later.startMin - prevLast.startMin} min` });
  return { day: next, changes, newId: snack.id };
}

export function replacementCandidates(trip: Trip, dayIndex: number, activityId: string): Place[] {
  const day = trip.days[dayIndex];
  const target = day.activities.find((a) => a.id === activityId);
  if (!target) return [];
  const used = usedPlaceIds(trip);
  const pool = getDestination(trip.destinationId).places.filter((pl) => !used.has(pl.id));
  const sameKind = pool.filter((pl) => (target.category === "food") === (pl.category === "food"));
  const rank = (pl: Place) => scorePlace(pl, trip.prefs) + (pl.category === target.category ? 2 : 0) - distanceKm(target, pl) * 0.6;
  return [...(sameKind.length ? sameKind : pool)].sort((a, b) => rank(b) - rank(a)).slice(0, 3);
}

export function proposeReplacement(trip: Trip, dayIndex: number, activityId: string, place: Place): Proposal {
  const day = trip.days[dayIndex];
  const target = day.activities.find((a) => a.id === activityId)!;
  const replacement = toActivity(trip.id, dayIndex, place, trip.prefs, target.slot);
  const next = finish({ ...day, activities: day.activities.map((a) => (a.id === activityId ? replacement : a)) }, trip);
  const placed = next.activities.find((a) => a.id === replacement.id)!;
  return {
    day: next,
    replacedId: activityId,
    newId: replacement.id,
    changes: [
      { type: "removed", text: target.name },
      { type: "added", text: `${place.name} at ${fmtTime(placed.startMin)} — ${place.description}` },
    ],
  };
}
