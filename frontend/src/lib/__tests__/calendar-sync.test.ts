import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Calendar from "expo-calendar";
import type { CalendarActivity, CalendarTrip } from "@/domain/logic/calendarEvents";
import { calendarNamespace, calendarStatus, removeTripFromCalendar, syncTripToCalendar } from "@/lib/calendar";

// An in-memory stand-in for the device calendar, so tests can inspect what ended up "in the Calendar app".
jest.mock("expo-calendar", () => {
  const store = {
    calendars: new Map<string, unknown>(),
    events: new Map<string, { id: string; calendarId: string; details: Record<string, unknown> }>(),
    nextId: 1,
    createsBeforeFailure: Infinity,
    granted: true,
  };
  class ExpoCalendarEvent {
    id: string;
    calendarId: string;
    details: Record<string, unknown>;
    constructor(id: string, calendarId: string, details: Record<string, unknown>) {
      this.id = id;
      this.calendarId = calendarId;
      this.details = details;
    }
    async update(details: Record<string, unknown>) { Object.assign(this.details, details); }
    async delete() { store.events.delete(this.id); }
    static async get(id: string) {
      const event = store.events.get(id);
      if (!event) throw new Error(`Event ${id} not found`);
      return event;
    }
  }
  class ExpoCalendar {
    id: string;
    title: string;
    allowsModifications = true;
    constructor(id: string, title: string) {
      this.id = id;
      this.title = title;
    }
    async createEvent(details: Record<string, unknown>) {
      if (store.createsBeforeFailure-- <= 0) throw new Error("Calendar write failed");
      const event = new ExpoCalendarEvent(String(store.nextId++), this.id, { ...details });
      store.events.set(event.id, event);
      return event;
    }
    static async get(id: string) {
      const calendar = store.calendars.get(id);
      if (!calendar) throw new Error(`Calendar ${id} not found`);
      return calendar;
    }
  }
  const permission = async () =>
    store.granted ? { granted: true, status: "granted", canAskAgain: true } : { granted: false, status: "denied", canAskAgain: false };
  return {
    __store: store,
    ExpoCalendar,
    ExpoCalendarEvent,
    EntityTypes: { EVENT: "event" },
    CalendarAccessLevel: { OWNER: "owner" },
    SourceType: { LOCAL: "local" },
    getCalendarPermissions: permission,
    requestCalendarPermissions: permission,
    getCalendars: async () => [...store.calendars.values()],
    getDefaultCalendarSync: () => ({ source: { id: "local", name: "Default", type: "local" } }),
    createCalendar: async (details: { title: string }) => {
      const calendar = new ExpoCalendar(String(store.nextId++), details.title);
      store.calendars.set(calendar.id, calendar);
      return calendar;
    },
  };
});

interface FakeEvent { id: string; calendarId: string; details: { title: string; startDate: Date } }
const store = (Calendar as unknown as {
  __store: { calendars: Map<string, { id: string; title: string }>; events: Map<string, FakeEvent>; nextId: number; createsBeforeFailure: number; granted: boolean };
}).__store;

const events = () => [...store.events.values()];
const titles = () => events().map((e) => e.details.title).sort();

const activity = (id: string, startMin: number, extra: Partial<CalendarActivity> = {}): CalendarActivity => ({
  id, name: `Stop ${id}`, area: "Shibuya", description: "", startMin, durationMin: 60, ...extra,
});
const trip = (activities: CalendarActivity[], id = "trip-1"): CalendarTrip => ({
  id, destination: "Tokyo", days: [{ index: 0, date: "2026-11-20", theme: "Old Tokyo", activities }],
});
const threeStops = trip([activity("a", 540), activity("b", 660), activity("c", 840)]);

beforeEach(async () => {
  store.calendars.clear();
  store.events.clear();
  store.nextId = 1;
  store.createsBeforeFailure = Infinity;
  store.granted = true;
  await AsyncStorage.clear();
});

describe("calendar sync", () => {
  test("the first export creates the Wayfare calendar and one event per activity", async () => {
    expect(await syncTripToCalendar(threeStops, "guest")).toEqual({ added: 3, updated: 0, removed: 0, unchanged: 0 });
    expect([...store.calendars.values()].map((c) => c.title)).toEqual(["Wayfare"]);
    expect(titles()).toEqual(["Stop a", "Stop b", "Stop c"]);
  });

  test("exporting again without changes writes nothing", async () => {
    await syncTripToCalendar(threeStops, "guest");
    expect(await syncTripToCalendar(threeStops, "guest")).toEqual({ added: 0, updated: 0, removed: 0, unchanged: 3 });
    expect(events()).toHaveLength(3);
  });

  test("a moved activity updates its existing event", async () => {
    await syncTripToCalendar(threeStops, "guest");
    const moved = trip([activity("a", 600), activity("b", 660), activity("c", 840)]);
    expect(await syncTripToCalendar(moved, "guest")).toEqual({ added: 0, updated: 1, removed: 0, unchanged: 2 });
    const a = events().find((e) => e.details.title === "Stop a");
    expect(a?.details.startDate.getHours()).toBe(10);
    expect(events()).toHaveLength(3);
  });

  test("a removed activity deletes its event and a new one adds an event", async () => {
    await syncTripToCalendar(threeStops, "guest");
    const changed = trip([activity("a", 540), activity("c", 840), activity("d", 960)]);
    expect(await syncTripToCalendar(changed, "guest")).toEqual({ added: 1, updated: 0, removed: 1, unchanged: 2 });
    expect(titles()).toEqual(["Stop a", "Stop c", "Stop d"]);
  });

  test("an event the user deleted in the Calendar app is recreated", async () => {
    await syncTripToCalendar(threeStops, "guest");
    store.events.delete(events()[0].id);
    expect(await syncTripToCalendar(threeStops, "guest")).toMatchObject({ added: 1, unchanged: 2 });
    expect(events()).toHaveLength(3);
  });

  test("if the user deleted the Wayfare calendar, a new one is created with all the events", async () => {
    await syncTripToCalendar(threeStops, "guest");
    store.calendars.clear();
    store.events.clear();
    expect(await syncTripToCalendar(threeStops, "guest")).toMatchObject({ added: 3 });
    expect(store.calendars.size).toBe(1);
    expect(events()).toHaveLength(3);
  });

  test("a write that fails partway keeps its progress, so a retry adds only what is missing", async () => {
    store.createsBeforeFailure = 2;
    await expect(syncTripToCalendar(threeStops, "guest")).rejects.toThrow("Calendar write failed");
    expect(events()).toHaveLength(2);
    store.createsBeforeFailure = Infinity;
    expect(await syncTripToCalendar(threeStops, "guest")).toMatchObject({ added: 1, unchanged: 2 });
    expect(events()).toHaveLength(3);
  });

  test("a double tap exports the trip once", async () => {
    await Promise.all([syncTripToCalendar(threeStops, "guest"), syncTripToCalendar(threeStops, "guest")]);
    expect(events()).toHaveLength(3);
  });

  test("without calendar access nothing is written", async () => {
    store.granted = false;
    await expect(syncTripToCalendar(threeStops, "guest")).rejects.toThrow("calendar access");
    expect(store.calendars.size).toBe(0);
  });
});

describe("calendar status", () => {
  test("none before export, synced after, stale after the itinerary changes", async () => {
    expect(await calendarStatus(threeStops, "guest")).toBe("none");
    await syncTripToCalendar(threeStops, "guest");
    expect(await calendarStatus(threeStops, "guest")).toBe("synced");
    expect(await calendarStatus(trip([activity("a", 600), activity("b", 660), activity("c", 840)]), "guest")).toBe("stale");
    expect(await calendarStatus(trip([activity("a", 540), activity("b", 660)]), "guest")).toBe("stale");
  });

  test("guests and accounts keep separate export records", async () => {
    await syncTripToCalendar(threeStops, calendarNamespace("guest", null));
    expect(await calendarStatus(threeStops, calendarNamespace("account", "user_123"))).toBe("none");
    expect(calendarNamespace("account", "user_123")).toBe("user_123");
    expect(calendarNamespace("guest", "user_123")).toBe("guest");
  });
});

describe("remove from calendar", () => {
  test("deletes only that trip's events and forgets the export", async () => {
    const other = trip([activity("x", 540)], "trip-2");
    await syncTripToCalendar(threeStops, "guest");
    await syncTripToCalendar(other, "guest");
    expect(await removeTripFromCalendar("trip-1", "guest")).toBe(3);
    expect(titles()).toEqual(["Stop x"]);
    expect(await calendarStatus(threeStops, "guest")).toBe("none");
  });

  test("removing a trip that was never exported does nothing", async () => {
    expect(await removeTripFromCalendar("trip-1", "guest")).toBe(0);
  });
});
