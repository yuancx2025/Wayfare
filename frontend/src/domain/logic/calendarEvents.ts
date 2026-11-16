import { parseISO } from "../lib/format";
import type { Activity, Day, Trip } from "../types";

export type CalendarActivity = Pick<Activity, "id" | "name" | "area" | "description" | "startMin" | "durationMin">;
export type CalendarDay = Pick<Day, "index" | "date" | "theme"> & { activities: CalendarActivity[] };
export type CalendarTrip = Pick<Trip, "id" | "destination"> & { days: CalendarDay[] };

export interface CalendarEventDraft {
  /** `${tripId}:${activityId}`; matches a draft to the event exported for it earlier. */
  key: string;
  title: string;
  location: string;
  notes: string;
  start: Date;
  end: Date;
  /** Changes whenever any field above changes, so unchanged events can be skipped on update. */
  fingerprint: string;
}

/**
 * An activity's start and end on the device's clock. Times are wall-clock minutes from the day's midnight; the
 * itinerary has no time zone, so they are read in the device's zone (docs/features/calendar-export.md, 3.4).
 * An activity that runs past midnight ends on the next date.
 */
export function activityTimes(day: Pick<Day, "date">, activity: Pick<Activity, "startMin" | "durationMin">) {
  const start = parseISO(day.date);
  start.setMinutes(activity.startMin);
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + activity.durationMin);
  return { start, end };
}

/** One draft per activity, in itinerary order. Activities without a duration have no calendar slot and are skipped. */
export function tripToCalendarEvents(trip: CalendarTrip): CalendarEventDraft[] {
  return trip.days.flatMap((day) =>
    day.activities
      .filter((a) => a.durationMin > 0)
      .map((a) => {
        const { start, end } = activityTimes(day, a);
        const title = a.name;
        const location = [a.name, a.area, trip.destination].filter(Boolean).join(", ");
        const notes = [`Day ${day.index + 1} · ${day.theme}`, a.description, "Added by Wayfare"].filter(Boolean).join("\n\n");
        return {
          key: `${trip.id}:${a.id}`,
          title,
          location,
          notes,
          start,
          end,
          fingerprint: JSON.stringify([title, location, notes, start.getTime(), end.getTime()]),
        };
      }),
  );
}
