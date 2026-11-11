import { describe, expect, test } from "@jest/globals";
import { reminderMessage, reminderTime } from "../logic/tripReminder";
import type { Activity, Day, Trip } from "../types";

const stop = (id: string, startMin: number): Activity => ({
  id, placeId: id, name: `Stop ${id}`, category: "culture", area: "Midtown", lat: 0, lng: 0,
  startMin, durationMin: 60, description: "", why: "",
});
const day = (index: number, date: string, activities: Activity[]): Day => ({
  index, date, theme: `Theme ${index + 1}`, areas: "Midtown", startMin: 540, bufferMin: 15, activities,
});
const trip: Trip = {
  id: "t1", destinationId: "nyc", destination: "New York City", country: "New York", image: "",
  startDate: "2026-11-10", endDate: "2026-11-11", travelers: 2, adjusted: false, createdAt: 0,
  prefs: {} as Trip["prefs"],
  days: [day(0, "2026-11-10", [stop("a", 9 * 60), stop("b", 13 * 60)]), day(1, "2026-11-11", [stop("c", 10 * 60)])],
};

describe("trip reminders", () => {
  test("evening before at 6 PM and the start morning at 8 AM", () => {
    expect(reminderTime("2026-11-10", "eve")).toEqual(new Date(2026, 10, 9, 18, 0));
    expect(reminderTime("2026-12-01", "eve")).toEqual(new Date(2026, 10, 30, 18, 0));
    expect(reminderTime("2026-11-10", "morning")).toEqual(new Date(2026, 10, 10, 8, 0));
  });

  test("the message names the destination and the first stop", () => {
    expect(reminderMessage(trip, "eve")).toEqual({
      title: "New York City starts tomorrow",
      body: "Day 1: Theme 1. First stop: Stop a at 9:00 AM.",
    });
    expect(reminderMessage(trip, "morning").title).toBe("Your New York City trip starts today");
  });

  test("a trip without a plan still gets a useful message", () => {
    expect(reminderMessage({ ...trip, days: [] }, "eve").body).toBe("Open Wayfare to see your itinerary.");
  });
});
