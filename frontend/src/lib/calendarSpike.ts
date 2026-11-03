// TEMPORARY (calendar export, increment 1): proves expo-calendar can create a "Wayfare" calendar and one event on
// each simulator. Delete this file and its menu row once increment 3 replaces it with src/lib/calendar.ts.
import { Platform } from "react-native";
import * as Calendar from "expo-calendar";

const TITLE = "Wayfare";
const COLOR = "#2E7D5B";

async function findOrCreateCalendar(): Promise<Calendar.ExpoCalendar> {
  const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
  const existing = calendars.find((c) => c.title === TITLE && c.allowsModifications);
  if (existing) return existing;

  if (Platform.OS === "ios") {
    // iOS calendars belong to a source (iCloud, Gmail, "On My iPhone"); reuse the default calendar's.
    const source = Calendar.getDefaultCalendarSync().source;
    return Calendar.createCalendar({ title: TITLE, color: COLOR, entityType: Calendar.EntityTypes.EVENT, sourceId: source.id, source });
  }
  // Android: a local calendar needs no signed-in account.
  return Calendar.createCalendar({
    title: TITLE,
    name: TITLE,
    color: COLOR,
    ownerAccount: TITLE,
    accessLevel: Calendar.CalendarAccessLevel.OWNER,
    source: { isLocalAccount: true, name: TITLE, type: Calendar.SourceType.LOCAL },
  });
}

/** Adds "Wayfare test event" tomorrow 10:00–11:00 and returns a message describing what happened. */
export async function addTestEvent(): Promise<string> {
  const { status } = await Calendar.requestCalendarPermissions();
  if (status !== "granted") return `Calendar permission: ${status}`;

  const calendar = await findOrCreateCalendar();
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(10, 0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  const event = await calendar.createEvent({ title: "Wayfare test event", location: "Test", startDate: start, endDate: end });
  return `Added event ${event.id} to calendar ${calendar.id}`;
}
