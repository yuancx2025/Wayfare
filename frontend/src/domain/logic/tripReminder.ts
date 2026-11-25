import { addDays, fmtTime, parseISO } from "../lib/format";
import type { Trip } from "../types";

export type ReminderWhen = "eve" | "morning";

export const REMINDER_OPTIONS: { when: ReminderWhen; label: string }[] = [
  { when: "eve", label: "The evening before, 6:00 PM" },
  { when: "morning", label: "The morning it starts, 8:00 AM" },
];

/** A local date and clock time on this device. setHours also handles DST days. */
function atMinute(iso: string, min: number): Date {
  const d = parseISO(iso);
  d.setHours(0, min, 0, 0);
  return d;
}

export function reminderTime(startDate: string, when: ReminderWhen): Date {
  return when === "eve" ? atMinute(addDays(startDate, -1), 18 * 60) : atMinute(startDate, 8 * 60);
}

export function reminderMessage(trip: Trip, when: ReminderWhen): { title: string; body: string } {
  const day = trip.days[0];
  const first = day?.activities[0];
  const plan = day ? `Day 1: ${day.theme}.` : "";
  const stop = first ? ` First stop: ${first.name} at ${fmtTime(first.startMin)}.` : "";
  return {
    title: when === "eve" ? `${trip.destination} starts tomorrow` : `Your ${trip.destination} trip starts today`,
    body: `${plan}${stop}`.trim() || "Open Wayfare to see your itinerary.",
  };
}
