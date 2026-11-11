import React, { act } from "react";
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { create } from "react-test-renderer";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { scheduledReminder, useReminderTaps, useTripReminder } from "@/lib/tripReminders";
import type { Trip } from "@/domain/types";

jest.mock("expo-notifications", () => ({
  DEFAULT_ACTION_IDENTIFIER: "default",
  SchedulableTriggerInputTypes: { DATE: "date" },
  setNotificationHandler: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  useLastNotificationResponse: jest.fn(),
  clearLastNotificationResponse: jest.fn(),
}));
const push = jest.fn();
jest.mock("expo-router", () => ({ useRouter: jest.fn() }));
jest.mock("react-native", () => ({ Linking: { openSettings: jest.fn() } }));

const notif = Notifications as jest.Mocked<typeof Notifications>;
const permission = (granted: boolean, canAskAgain = true) => ({ granted, canAskAgain, status: granted ? "granted" : "denied", expires: "never" }) as never;

const makeTrip = (startDate: string): Trip => ({
  id: "t1", destinationId: "chicago", destination: "Chicago", country: "Illinois", image: "", startDate, endDate: startDate,
  travelers: 1, adjusted: false, createdAt: 0, prefs: {} as Trip["prefs"],
  days: [{
    index: 0, date: startDate, theme: "Loop", areas: "Loop", startMin: 540, bufferMin: 15,
    activities: [{ id: "a", placeId: "a", name: "Art Institute", category: "culture", area: "Loop", lat: 0, lng: 0, startMin: 540, durationMin: 60, description: "", why: "" }],
  }],
});
const trip = makeTrip("2099-05-01");

function Probe<T>({ use, onRender }: { use: () => T; onRender: (value: T) => void }) {
  onRender(use());
  return null;
}

async function mount<T>(use: () => T) {
  const result = {} as { current: T };
  await act(async () => {
    create(React.createElement(Probe<T>, { use, onRender: (value: T) => { result.current = value; } }));
  });
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useRouter).mockReturnValue({ push } as never);
  notif.getAllScheduledNotificationsAsync.mockResolvedValue([]);
  notif.requestPermissionsAsync.mockResolvedValue(permission(true));
});

describe("useTripReminder", () => {
  test("schedules one reminder per trip at the chosen time", async () => {
    const hook = await mount(() => useTripReminder(trip));
    expect(hook.current.when).toBeNull();
    await act(async () => { expect(await hook.current.choose("eve")).toBe(true); });
    const request = notif.scheduleNotificationAsync.mock.calls[0][0];
    expect(request.identifier).toBe("trip-reminder:t1");
    expect(request.trigger).toEqual({ type: "date", date: new Date(2099, 3, 30, 18, 0) });
    expect(request.content.title).toBe("Chicago starts tomorrow");
    expect(request.content.data).toEqual({ tripId: "t1", when: "eve" });
    expect(hook.current.when).toBe("eve");
  });

  test("reads back an existing reminder for this trip only", async () => {
    notif.getAllScheduledNotificationsAsync.mockResolvedValue([
      { identifier: "trip-reminder:other", content: { data: { when: "eve" } } },
      { identifier: "trip-reminder:t1", content: { data: { when: "morning" } } },
    ] as never);
    expect(await scheduledReminder("t1")).toBe("morning");
    expect(await scheduledReminder("t2")).toBeNull();
  });

  test("a time that has passed is not offered and never asks for permission", async () => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const hook = await mount(() => useTripReminder(makeTrip(today)));
    expect(hook.current.options.find((o) => o.when === "eve")?.passed).toBe(true);
    await act(async () => { expect(await hook.current.choose("eve")).toBe(false); });
    expect(hook.current.problem).toBe("passed");
    expect(notif.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  test("refused notifications schedule nothing and say whether Settings is needed", async () => {
    const hook = await mount(() => useTripReminder(trip));
    notif.requestPermissionsAsync.mockResolvedValueOnce(permission(false, true));
    await act(async () => { await hook.current.choose("morning"); });
    expect(hook.current.problem).toBe("denied");
    notif.requestPermissionsAsync.mockResolvedValueOnce(permission(false, false));
    await act(async () => { await hook.current.choose("morning"); });
    expect(hook.current.problem).toBe("blocked");
    expect(notif.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  test("turning it off cancels the scheduled notification", async () => {
    notif.getAllScheduledNotificationsAsync.mockResolvedValue([{ identifier: "trip-reminder:t1", content: { data: { when: "eve" } } }] as never);
    const hook = await mount(() => useTripReminder(trip));
    expect(hook.current.when).toBe("eve");
    await act(async () => { await hook.current.choose(null); });
    expect(notif.cancelScheduledNotificationAsync).toHaveBeenCalledWith("trip-reminder:t1");
    expect(hook.current.when).toBeNull();
  });

  test("a scheduling failure is reported instead of claiming success", async () => {
    notif.scheduleNotificationAsync.mockRejectedValueOnce(new Error("boom"));
    const hook = await mount(() => useTripReminder(trip));
    await act(async () => { expect(await hook.current.choose("eve")).toBe(false); });
    expect(hook.current.problem).toBe("error");
    expect(hook.current.when).toBeNull();
  });
});

describe("useReminderTaps", () => {
  const response = (actionIdentifier: string, data: Record<string, unknown>) =>
    ({ actionIdentifier, notification: { request: { content: { data } } } }) as never;

  test("tapping a reminder opens its trip once", async () => {
    notif.useLastNotificationResponse.mockReturnValue(response("default", { tripId: "t1", when: "eve" }));
    await mount(() => useReminderTaps());
    expect(push).toHaveBeenCalledWith("/trip/t1");
    expect(notif.clearLastNotificationResponse).toHaveBeenCalled();
  });

  test("other notifications and dismissals are ignored", async () => {
    notif.useLastNotificationResponse.mockReturnValue(response("default", { other: true }));
    await mount(() => useReminderTaps());
    notif.useLastNotificationResponse.mockReturnValue(response("com.apple.UNNotificationDismissActionIdentifier", { tripId: "t1" }));
    await mount(() => useReminderTaps());
    expect(push).not.toHaveBeenCalled();
  });
});
