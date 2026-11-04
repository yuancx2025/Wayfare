import { Platform } from "react-native";
import * as Calendar from "expo-calendar";
import { tripToCalendarEvents, type CalendarEventDraft, type CalendarTrip } from "@/domain/logic/calendarEvents";
import { loadJSON, saveJSONStrict } from "@/lib/storage";

export type CalendarPermission = "undetermined" | "granted" | "denied" | "blocked";
export type CalendarStatus = "none" | "synced" | "stale";
export interface SyncResult { added: number; updated: number; removed: number; unchanged: number }

interface ExportedEvent { eventId: string; fingerprint: string }

/** What this device exported, per identity: trip id → draft key → calendar event. */
interface CalendarIndex {
  calendarId: string | null;
  trips: Record<string, Record<string, ExportedEvent>>;
}

const CALENDAR_TITLE = "Wayfare";
const CALENDAR_COLOR = "#2E7D5B";

/** Guests and each account keep separate records, like their trips. */
export const calendarNamespace = (mode: string, userId: string | null | undefined) =>
  mode === "account" && userId ? userId : "guest";

const indexKey = (namespace: string) => `wayfare:calendar:${namespace}`;

async function loadIndex(namespace: string): Promise<CalendarIndex> {
  const saved = await loadJSON<CalendarIndex>(indexKey(namespace));
  return { calendarId: saved?.calendarId ?? null, trips: saved?.trips ?? {} };
}

function toPermission(r: Calendar.PermissionResponse): CalendarPermission {
  if (r.granted) return "granted";
  if (r.status === "undetermined") return "undetermined";
  return r.canAskAgain ? "denied" : "blocked";
}

export async function getCalendarPermission(): Promise<CalendarPermission> {
  return toPermission(await Calendar.getCalendarPermissions());
}

/** Shows the system prompt when it still can. */
export async function requestCalendarPermission(): Promise<CalendarPermission> {
  return toPermission(await Calendar.requestCalendarPermissions());
}

async function requireAccess() {
  const permission = await getCalendarPermission();
  if (permission !== "granted") throw new Error("Wayfare needs calendar access to do this.");
}

// Calendar writes run one at a time, so a double tap cannot export the same trip twice.
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

/** Missing items reject on iOS and resolve to nothing on Android; both mean "gone". */
async function findEvent(eventId: string): Promise<Calendar.ExpoCalendarEvent | null> {
  try {
    return (await Calendar.ExpoCalendarEvent.get(eventId)) ?? null;
  } catch {
    return null;
  }
}

async function openCalendar(index: CalendarIndex): Promise<Calendar.ExpoCalendar> {
  if (index.calendarId) {
    try {
      const saved = await Calendar.ExpoCalendar.get(index.calendarId);
      if (saved) return saved;
    } catch {
      // The user deleted it; fall through and find or create another.
    }
  }
  const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
  const existing = calendars.find((c) => c.title === CALENDAR_TITLE && c.allowsModifications);
  if (existing) return existing;

  if (Platform.OS === "ios") {
    // iOS calendars belong to a source (iCloud, "On My iPhone"); reuse the default calendar's.
    const source = Calendar.getDefaultCalendarSync().source;
    return Calendar.createCalendar({ title: CALENDAR_TITLE, color: CALENDAR_COLOR, entityType: Calendar.EntityTypes.EVENT, sourceId: source.id, source });
  }
  // Android: a local calendar needs no signed-in account.
  return Calendar.createCalendar({
    title: CALENDAR_TITLE,
    name: CALENDAR_TITLE,
    color: CALENDAR_COLOR,
    ownerAccount: CALENDAR_TITLE,
    accessLevel: Calendar.CalendarAccessLevel.OWNER,
    source: { isLocalAccount: true, name: CALENDAR_TITLE, type: Calendar.SourceType.LOCAL },
  });
}

const eventDetails = (d: CalendarEventDraft) => ({ title: d.title, location: d.location, notes: d.notes, startDate: d.start, endDate: d.end });

/**
 * Makes the Wayfare calendar match the trip: creates new activities, updates changed ones, recreates events the user
 * deleted, and deletes events for activities that are gone. Running it again with no changes writes nothing.
 * Progress is saved even if a write fails partway, so a retry never duplicates events.
 */
export function syncTripToCalendar(trip: CalendarTrip, namespace: string): Promise<SyncResult> {
  return serialized(async () => {
    await requireAccess();
    const index = await loadIndex(namespace);
    const calendar = await openCalendar(index);
    index.calendarId = calendar.id;

    const current = { ...index.trips[trip.id] };
    const drafts = tripToCalendarEvents(trip);
    const keep = new Set(drafts.map((d) => d.key));
    const result: SyncResult = { added: 0, updated: 0, removed: 0, unchanged: 0 };

    try {
      for (const draft of drafts) {
        const previous = current[draft.key];
        const existing = previous ? await findEvent(previous.eventId) : null;
        if (existing && existing.calendarId === calendar.id) {
          if (previous.fingerprint === draft.fingerprint) {
            result.unchanged++;
          } else {
            await existing.update(eventDetails(draft));
            current[draft.key] = { eventId: previous.eventId, fingerprint: draft.fingerprint };
            result.updated++;
          }
          continue;
        }
        const created = await calendar.createEvent(eventDetails(draft));
        current[draft.key] = { eventId: created.id, fingerprint: draft.fingerprint };
        result.added++;
      }
      for (const key of Object.keys(current)) {
        if (keep.has(key)) continue;
        const stale = await findEvent(current[key].eventId);
        if (stale) {
          await stale.delete();
          result.removed++;
        }
        delete current[key];
      }
    } finally {
      index.trips[trip.id] = current;
      await saveJSONStrict(indexKey(namespace), index);
    }
    return result;
  });
}

/** Deletes every event exported for the trip and forgets it. Returns how many events were deleted. */
export function removeTripFromCalendar(tripId: string, namespace: string): Promise<number> {
  return serialized(async () => {
    const index = await loadIndex(namespace);
    const exported = index.trips[tripId];
    if (!exported) return 0;
    await requireAccess();

    const remaining = { ...exported };
    let removed = 0;
    try {
      for (const [key, { eventId }] of Object.entries(exported)) {
        const event = await findEvent(eventId);
        if (event) {
          await event.delete();
          removed++;
        }
        delete remaining[key];
      }
    } finally {
      if (Object.keys(remaining).length) index.trips[tripId] = remaining;
      else delete index.trips[tripId];
      await saveJSONStrict(indexKey(namespace), index);
    }
    return removed;
  });
}

/**
 * Compares the last export with the current itinerary without touching the calendar: "stale" after an adjustment.
 * It cannot see events the user deleted in the Calendar app; the next sync recreates those.
 */
export async function calendarStatus(trip: CalendarTrip, namespace: string): Promise<CalendarStatus> {
  const exported = (await loadIndex(namespace)).trips[trip.id];
  if (!exported || !Object.keys(exported).length) return "none";
  const drafts = tripToCalendarEvents(trip);
  const same = drafts.length === Object.keys(exported).length && drafts.every((d) => exported[d.key]?.fingerprint === d.fingerprint);
  return same ? "synced" : "stale";
}
