import { describe, expect, test } from "@jest/globals";
import { classifyTrip, groupTrips, recentPast, statusLabel } from "../logic/tripHistory";

const today = "2026-10-20";
const trip = (id: string, startDate: string, endDate: string) => ({ id, startDate, endDate });

describe("trip history", () => {
  test("a trip that ended yesterday is past", () => {
    const item = trip("past", "2026-10-10", "2026-10-19");
    expect(classifyTrip(item, today)).toBe("past");
    expect(statusLabel(item, today)).toBe("Past");
  });

  test("a trip that ends today is ongoing", () => {
    const item = trip("ends-today", "2026-10-18", "2026-10-20");
    expect(classifyTrip(item, today)).toBe("ongoing");
    expect(statusLabel(item, today)).toBe("Happening now");
  });

  test("a trip that starts today is ongoing", () => {
    const item = trip("starts-today", "2026-10-20", "2026-10-24");
    expect(classifyTrip(item, today)).toBe("ongoing");
    expect(statusLabel(item, today)).toBe("Happening now");
  });

  test("a one-day trip today is ongoing", () => {
    const item = trip("today-only", "2026-10-20", "2026-10-20");
    expect(classifyTrip(item, today)).toBe("ongoing");
    expect(statusLabel(item, today)).toBe("Happening now");
  });

  test("a trip that crosses a month boundary and contains today is ongoing", () => {
    const item = trip("spans-month", "2026-09-28", "2026-10-22");
    expect(classifyTrip(item, today)).toBe("ongoing");
    expect(statusLabel(item, today)).toBe("Happening now");
  });

  test("a trip that starts tomorrow is upcoming", () => {
    const item = trip("tomorrow", "2026-10-21", "2026-10-23");
    expect(classifyTrip(item, today)).toBe("upcoming");
    expect(statusLabel(item, today)).toBe("Tomorrow");
  });

  test("a later trip is labeled with the day count", () => {
    const item = trip("later", "2026-10-25", "2026-10-28");
    expect(classifyTrip(item, today)).toBe("upcoming");
    expect(statusLabel(item, today)).toBe("In 5 days");
  });

  test("sections sort by date and then id", () => {
    const items = [
      trip("b-ongoing-late", "2026-10-18", "2026-10-25"),
      trip("a-ongoing-soon", "2026-10-10", "2026-10-21"),
      trip("z-past-old", "2026-09-01", "2026-09-04"),
      trip("m-past-recent", "2026-10-01", "2026-10-15"),
      trip("same-end-b", "2026-10-01", "2026-10-12"),
      trip("same-end-a", "2026-09-20", "2026-10-12"),
      trip("up-later", "2026-11-02", "2026-11-05"),
      trip("up-soon-b", "2026-10-21", "2026-10-22"),
      trip("up-soon-a", "2026-10-21", "2026-10-28"),
    ];
    const sections = groupTrips(items, today);
    expect(sections.map((section) => section.phase)).toEqual(["ongoing", "upcoming", "past"]);
    expect(sections[0].data.map((item) => item.id)).toEqual(["a-ongoing-soon", "b-ongoing-late"]);
    expect(sections[1].data.map((item) => item.id)).toEqual(["up-soon-a", "up-soon-b", "up-later"]);
    expect(sections[2].data.map((item) => item.id)).toEqual(["m-past-recent", "same-end-a", "same-end-b", "z-past-old"]);
    expect(recentPast(items, today).map((item) => item.id)).toEqual(["m-past-recent", "same-end-a", "same-end-b"]);
  });

  test("grouping keeps the input array and its trip objects", () => {
    const items = Object.freeze([
      trip("later", "2026-11-01", "2026-11-03"),
      trip("past", "2026-09-01", "2026-09-02"),
    ]);
    const order = items.map((item) => item.id);
    const sections = groupTrips(items, today);
    expect(items.map((item) => item.id)).toEqual(order);
    expect(sections[0].data[0]).toBe(items[0]);
    expect(sections[1].data[0]).toBe(items[1]);
    expect(groupTrips([trip("only-upcoming", "2026-12-01", "2026-12-02")], today).map((section) => section.phase)).toEqual(["upcoming"]);
  });
});
