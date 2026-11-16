import { useEffect, useState } from "react";
import { Linking } from "react-native";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { REMINDER_OPTIONS, reminderMessage, reminderTime, type ReminderWhen } from "@/domain/logic/tripReminder";
import type { Trip } from "@/domain/types";

// Without a handler, iOS drops notifications that arrive while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export type ReminderProblem = "denied" | "blocked" | "passed" | "error";

const idFor = (tripId: string) => `trip-reminder:${tripId}`;

export async function scheduledReminder(tripId: string): Promise<ReminderWhen | null> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  const found = all.find((n) => n.identifier === idFor(tripId));
  const when = found?.content.data?.when;
  return when === "eve" || when === "morning" ? when : null;
}

export async function cancelTripReminder(tripId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(idFor(tripId));
}

/** Replaces any earlier reminder for this trip, since the identifier is per trip. */
export async function scheduleTripReminder(trip: Trip, when: ReminderWhen): Promise<Date> {
  const date = reminderTime(trip.startDate, when);
  await Notifications.scheduleNotificationAsync({
    identifier: idFor(trip.id),
    content: { ...reminderMessage(trip, when), data: { tripId: trip.id, when } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
  });
  return date;
}

export function useTripReminder(trip: Trip) {
  const [when, setWhen] = useState<ReminderWhen | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ReminderProblem | null>(null);

  useEffect(() => {
    let live = true;
    scheduledReminder(trip.id).then((w) => { if (live) setWhen(w); }, () => { if (live) setWhen(null); });
    return () => { live = false; };
  }, [trip.id]);

  const now = new Date();
  const options = REMINDER_OPTIONS.map((o) => ({ ...o, passed: reminderTime(trip.startDate, o.when) <= now }));

  const choose = async (next: ReminderWhen | null) => {
    setBusy(true);
    setProblem(null);
    try {
      if (next === null) {
        await cancelTripReminder(trip.id);
        setWhen(null);
        return true;
      }
      if (reminderTime(trip.startDate, next) <= new Date()) {
        setProblem("passed");
        return false;
      }
      const permission = await Notifications.requestPermissionsAsync();
      if (!permission.granted) {
        setProblem(permission.canAskAgain ? "denied" : "blocked");
        return false;
      }
      await scheduleTripReminder(trip, next);
      setWhen(next);
      return true;
    } catch {
      setProblem("error");
      return false;
    } finally {
      setBusy(false);
    }
  };

  return { when, busy, problem, options, choose, openSettings: () => { void Linking.openSettings(); } };
}

/** Opens the trip when the user taps its reminder, including a tap that launched the app. */
export function useReminderTaps() {
  const response = Notifications.useLastNotificationResponse();
  const router = useRouter();
  useEffect(() => {
    const tripId = response?.notification.request.content.data?.tripId;
    if (typeof tripId !== "string" || response?.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    Notifications.clearLastNotificationResponse();
    router.push(`/trip/${tripId}`);
  }, [response, router]);
}
