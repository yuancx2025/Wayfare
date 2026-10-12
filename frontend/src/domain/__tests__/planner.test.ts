import { describe, expect, test } from "@jest/globals";
import { getDestination } from "../data/places";
import { addDays } from "../lib/format";
import { proposeAdjustment } from "../logic/adjust";
import { buildTrip, retimeDay } from "../logic/generate";
import type { TripDraft } from "../types";

const draft: TripDraft = {
  destination: "New York City",
  startDate: "2026-11-02",
  endDate: addDays("2026-11-02", 2),
  travelers: 2,
  simulateFailure: false,
  prefs: {
    pace: "balanced",
    interests: ["food", "culture", "museums"],
    food: ["local-classics", "street-food"],
    transport: "walking",
    budget: "moderate",
  },
};

describe("buildTrip", () => {
  test("uses the requested dates and day count", () => {
    const trip = buildTrip("t1", getDestination("nyc"), draft);
    expect(trip.days).toHaveLength(3);
    expect(trip.days[0].date).toBe(draft.startDate);
    expect(trip.days[2].date).toBe(draft.endDate);
    expect(trip.days.every((day) => day.activities.length > 0)).toBe(true);
  });
});

describe("retimeDay", () => {
  test("keeps stops in chronological order with room for the previous visit", () => {
    const trip = buildTrip("t2", getDestination("nyc"), draft);
    const day = retimeDay(trip.days[0], trip.prefs);
    for (let i = 1; i < day.activities.length; i += 1) {
      const prev = day.activities[i - 1];
      expect(day.activities[i].startMin).toBeGreaterThanOrEqual(prev.startMin + prev.durationMin);
      expect(day.activities[i].legIn).toBeDefined();
    }
  });
});

describe("proposeAdjustment", () => {
  const trip = buildTrip("t3", getDestination("chicago"), draft);

  test("relaxed proposes a change", () => {
    const proposal = proposeAdjustment(trip, 0, "relaxed");
    expect(proposal.changes.length).toBeGreaterThan(0);
    expect(proposal.day.activities.length).toBeLessThanOrEqual(trip.days[0].activities.length);
  });

  test("less walking returns a day and a change list", () => {
    const proposal = proposeAdjustment(trip, 0, "less-walking");
    expect(Array.isArray(proposal.changes)).toBe(true);
    expect(proposal.day.index).toBe(0);
  });

  test("more food proposes an added stop when a place is free", () => {
    const proposal = proposeAdjustment(trip, 0, "more-food");
    expect(proposal.changes.length).toBeGreaterThan(0);
    expect(proposal.day.activities.length).toBe(trip.days[0].activities.length + 1);
  });
});
