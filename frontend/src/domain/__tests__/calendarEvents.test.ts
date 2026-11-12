import { describe, expect, test } from "@jest/globals";
import { toISO } from "../lib/format";
import { activityTimes, tripToCalendarEvents, type CalendarActivity, type CalendarTrip } from "../logic/calendarEvents";

/** "YYYY-MM-DD HH:MM" on the device's clock, so expectations read like the itinerary. */
const local = (d: Date) => `${toISO(d)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

const activity = (id: string, startMin: number, durationMin: number, extra: Partial<CalendarActivity> = {}): CalendarActivity => ({
  id,
  name: `Stop ${id}`,
  area: "Shibuya",
  description: `About ${id}`,
  startMin,
  durationMin,
  ...extra,
});

const trip = (days: CalendarTrip["days"]): CalendarTrip => ({ id: "trip-1", destination: "Tokyo", days });

describe("activity times", () => {
  test("start is the day's date plus startMin; end adds the duration", () => {
    const { start, end } = activityTimes({ date: "2026-11-20" }, { startMin: 600, durationMin: 90 });
    expect(local(start)).toBe("2026-11-20 10:00");
    expect(local(end)).toBe("2026-11-20 11:30");
  });

  test("an activity that runs past midnight ends on the next date", () => {
    const { start, end } = activityTimes({ date: "2026-11-20" }, { startMin: 23 * 60, durationMin: 120 });
    expect(local(start)).toBe("2026-11-20 23:00");
    expect(local(end)).toBe("2026-11-21 01:00");
  });

  test("the last day of a month rolls into the next month", () => {
    const { end } = activityTimes({ date: "2026-11-30" }, { startMin: 22 * 60, durationMin: 180 });
    expect(local(end)).toBe("2026-12-01 01:00");
  });
});

describe("trip to calendar events", () => {
  const twoDays = trip([
    { index: 0, date: "2026-11-20", theme: "Old Tokyo", activities: [activity("a", 540, 60), activity("b", 720, 45)] },
    { index: 1, date: "2026-11-21", theme: "Neon nights", activities: [activity("c", 1140, 90)] },
  ]);

  test("one event per activity across days, in itinerary order", () => {
    const events = tripToCalendarEvents(twoDays);
    expect(events.map((e) => [e.key, local(e.start), local(e.end)])).toEqual([
      ["trip-1:a", "2026-11-20 09:00", "2026-11-20 10:00"],
      ["trip-1:b", "2026-11-20 12:00", "2026-11-20 12:45"],
      ["trip-1:c", "2026-11-21 19:00", "2026-11-21 20:30"],
    ]);
  });

  test("events carry the place, the day's theme, and the description", () => {
    const [first] = tripToCalendarEvents(twoDays);
    expect(first.title).toBe("Stop a");
    expect(first.location).toBe("Stop a, Shibuya, Tokyo");
    expect(first.notes).toBe("Day 1 · Old Tokyo\n\nAbout a\n\nAdded by Wayfare");
  });

  test("activities without a duration are skipped", () => {
    const events = tripToCalendarEvents(trip([
      { index: 0, date: "2026-11-20", theme: "Day", activities: [activity("a", 540, 0), activity("b", 600, 30)] },
    ]));
    expect(events.map((e) => e.key)).toEqual(["trip-1:b"]);
  });

  test("an empty description is left out of the notes", () => {
    const [event] = tripToCalendarEvents(trip([
      { index: 0, date: "2026-11-20", theme: "Day", activities: [activity("a", 540, 60, { description: "" })] },
    ]));
    expect(event.notes).toBe("Day 1 · Day\n\nAdded by Wayfare");
  });

  test("keys and fingerprints are stable when nothing changes", () => {
    expect(tripToCalendarEvents(twoDays)).toEqual(tripToCalendarEvents(twoDays));
  });

  test("the fingerprint changes when the time or the name changes, and the key does not", () => {
    const base = tripToCalendarEvents(twoDays)[0];
    const moved = tripToCalendarEvents(trip([
      { index: 0, date: "2026-11-20", theme: "Old Tokyo", activities: [activity("a", 570, 60)] },
    ]))[0];
    const renamed = tripToCalendarEvents(trip([
      { index: 0, date: "2026-11-20", theme: "Old Tokyo", activities: [activity("a", 540, 60, { name: "Senso-ji" })] },
    ]))[0];
    expect(moved.key).toBe(base.key);
    expect(moved.fingerprint).not.toBe(base.fingerprint);
    expect(renamed.fingerprint).not.toBe(base.fingerprint);
  });
});
