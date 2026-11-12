import React, { act } from "react";
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { TripVisitAction } from "@/components/TripVisitAction";
import { TripCard } from "@/components/trip";
import { classifyTrip, statusLabel } from "@/domain/logic/tripHistory";
import { sampleTrip, summarize } from "@/lib/api/local";
import type { useStore } from "@/state/store";

jest.mock("react-native/Libraries/Components/Pressable/Pressable", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  return { default: (props: object) => React.createElement("Pressable", props) };
});
jest.mock("@/state/store", () => ({ useStore: () => mockStore }));
jest.mock("@/lib/api", () => ({ useApi: () => ({ imageUrl: (src: string) => src }) }));
jest.mock("@/components/Icon", () => ({ Icon: () => null }));
jest.mock("@/components/FavoriteButton", () => ({ FavoriteButton: () => null }));
jest.mock("@/components/ui", () => ({}));
jest.mock("expo-image", () => ({ Image: () => null }));

const trip = sampleTrip();
const onSaved = jest.fn();
let mockStore: Pick<ReturnType<typeof useStore>, "tripMetadataPending" | "setTripVisited" | "showToast">;
let screen: ReactTestRenderer | undefined;
const action = () => screen!.root.find((node) => String(node.type) === "Pressable" && node.props.accessibilityState !== undefined);
async function mount(visited = false) {
  await act(async () => { screen = create(React.createElement(TripVisitAction, { trip: { ...trip, visited }, onSaved })); });
}
beforeEach(() => {
  jest.clearAllMocks();
  mockStore = { tripMetadataPending: {}, setTripVisited: jest.fn<(id: string, visited: boolean) => Promise<void>>().mockResolvedValue(undefined), showToast: jest.fn() };
});
afterEach(async () => { if (screen) await act(async () => screen!.unmount()); screen = undefined; });

test.each([false, true])("the explicit visited action persists the opposite status: %s", async (visited) => {
  await mount(visited);
  expect(action().props.accessibilityState.selected).toBe(visited);
  await act(async () => { await action().props.onPress(); });
  expect(mockStore.setTripVisited).toHaveBeenCalledWith(trip.id, !visited);
  expect(onSaved).toHaveBeenCalledTimes(1);
});

test("failure keeps the action open for retry and never reports success", async () => {
  jest.mocked(mockStore.setTripVisited).mockRejectedValueOnce(new Error("Offline"));
  await mount();
  await act(async () => { await action().props.onPress(); });
  expect(onSaved).not.toHaveBeenCalled();
  expect(mockStore.showToast).toHaveBeenCalledWith("Couldn't save visited status. Try again.");
  await act(async () => { await action().props.onPress(); });
  expect(onSaved).toHaveBeenCalledTimes(1);
});

test("pending favorite or visit writes disable the shared metadata action", async () => {
  mockStore.tripMetadataPending[trip.id] = true;
  await mount();
  expect(action().props.accessibilityState).toMatchObject({ disabled: true, busy: true });
  await act(async () => { await action().props.onPress(); });
  expect(mockStore.setTripVisited).not.toHaveBeenCalled();
});

test("repeated presses wait for confirmed persistence before closing", async () => {
  let resolve!: () => void;
  jest.mocked(mockStore.setTripVisited).mockReturnValueOnce(new Promise<void>((yes) => { resolve = yes; }));
  await mount();
  await act(async () => { action().props.onPress(); action().props.onPress(); });
  expect(mockStore.setTripVisited).toHaveBeenCalledTimes(1);
  expect(onSaved).not.toHaveBeenCalled();
  await act(async () => resolve());
  expect(onSaved).toHaveBeenCalledTimes(1);
});

test("visited is displayed separately without changing the trip's date classification", async () => {
  const summary = { ...summarize(trip), startDate: "2099-01-01", endDate: "2099-01-03", visited: true };
  expect(classifyTrip(summary, "2026-11-03")).toBe("upcoming");
  await act(async () => { screen = create(React.createElement(TripCard, { trip: summary, today: "2026-11-03", onPress: jest.fn() })); });
  expect(JSON.stringify(screen!.toJSON())).toContain("Visited");
  expect(JSON.stringify(screen!.toJSON())).toContain(statusLabel(summary, "2026-11-03"));
});
