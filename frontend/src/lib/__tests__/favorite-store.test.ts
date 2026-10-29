import React, { act } from "react";
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { StoreProvider, useStore } from "@/state/store";
import { api } from "@/lib/api";
import { sampleTrip, summarize } from "@/lib/api/local";
import { DEFAULT_PREFS } from "@/domain/logic/labels";
import type { Trip, TripMetadataResult, TripSummary } from "@/domain/types";

jest.mock("@/lib/api", () => ({
  ApiError: jest.requireActual<typeof import("@/lib/api/types")>("@/lib/api/types").ApiError,
  api: {
    listTrips: jest.fn(), getTrip: jest.fn(), getMe: jest.fn(), getPreferences: jest.fn(), capabilities: jest.fn(),
    updateTripMetadata: jest.fn(), deleteTrip: jest.fn(),
  },
}));

const mockApi = jest.mocked(api);
const trip = { ...sampleTrip(), version: 1 };
let store: ReturnType<typeof useStore>;
let screen: ReactTestRenderer;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function Probe() {
  const value = useStore();
  React.useEffect(() => { store = value; }, [value]);
  return null;
}
async function mount() {
  await act(async () => { screen = create(React.createElement(StoreProvider, null, React.createElement(Probe))); });
}

beforeEach(() => {
  jest.resetAllMocks();
  mockApi.listTrips.mockResolvedValue([summarize(trip)]);
  mockApi.getTrip.mockResolvedValue(trip);
  mockApi.getPreferences.mockResolvedValue(DEFAULT_PREFS);
  mockApi.capabilities.mockResolvedValue({ google: false, llm: false, agent: false });
  mockApi.getMe.mockResolvedValue({ id: "guest", name: "Alex", initials: "A", home: "", stats: { trips: 1, daysPlanned: 5, countries: 1 } });
  mockApi.updateTripMetadata.mockImplementation(async (id, patch) => ({ id, isFavorite: patch.isFavorite ?? false, visited: false }));
  mockApi.deleteTrip.mockResolvedValue(undefined);
});
afterEach(async () => { if (screen) await act(async () => screen.unmount()); });

test("all views stay unchanged while saving; a metadata response preserves a newer itinerary", async () => {
  await mount();
  await act(async () => { await store.loadTrip(trip.id); });
  const request = deferred<TripMetadataResult>();
  mockApi.updateTripMetadata.mockReturnValueOnce(request.promise);
  let saving!: Promise<void>;
  await act(async () => { saving = store.setTripFavorite(trip.id, true); });
  expect(store.favoritePending[trip.id]).toBe(true);
  expect(store.summaries[0].isFavorite).toBe(false);
  const newer = { ...trip, version: 2, days: trip.days.map((day) => ({ ...day, theme: "A newer plan" })) };
  await act(async () => store.putTrip(newer));
  await act(async () => { request.resolve({ id: trip.id, isFavorite: true, visited: false }); await saving; });
  expect(store.trips[trip.id]).toEqual({ ...newer, isFavorite: true });
  expect(store.summaries[0].isFavorite).toBe(true);
  expect(store.favoritePending[trip.id]).toBeUndefined();
});

test("a delayed trip read cannot undo a confirmed favorite or a newer itinerary", async () => {
  await mount();
  const request = deferred<Trip>();
  mockApi.getTrip.mockReturnValueOnce(request.promise);
  let reading!: Promise<Trip>;
  await act(async () => { reading = store.loadTrip(trip.id); });
  await act(async () => { await store.setTripFavorite(trip.id, true); });
  const newer = { ...trip, version: 3 };
  await act(async () => store.putTrip(newer));
  await act(async () => { request.resolve(trip); await reading; });
  expect(store.trips[trip.id]).toMatchObject({ version: 3, isFavorite: true });
});

test.each(["before", "during"])("a refresh started %s a favorite save cannot overwrite it", async (timing) => {
  await mount();
  const list = deferred<TripSummary[]>();
  const metadata = deferred<TripMetadataResult>();
  mockApi.listTrips.mockReturnValueOnce(list.promise);
  mockApi.updateTripMetadata.mockReturnValueOnce(metadata.promise);
  let reading!: Promise<void>;
  let saving!: Promise<void>;
  await act(async () => {
    if (timing === "before") reading = store.refresh();
    saving = store.setTripFavorite(trip.id, true);
    if (timing === "during") reading = store.refresh();
  });
  await act(async () => { metadata.resolve({ id: trip.id, isFavorite: true, visited: false }); await saving; });
  await act(async () => { list.resolve([summarize(trip)]); await reading; });
  expect(store.summaries[0].isFavorite).toBe(true);
  // A subsequent fresh read can observe a change from another installation.
  await act(async () => { await store.refresh(); });
  expect(store.summaries[0].isFavorite).toBe(false);
});

test("failed writes leave the collection unchanged and allow retry", async () => {
  await mount();
  mockApi.updateTripMetadata.mockRejectedValueOnce(new Error("No connection"));
  await act(async () => { await expect(store.setTripFavorite(trip.id, true)).rejects.toThrow("No connection"); });
  expect(store.summaries[0].isFavorite).toBe(false);
  expect(store.favoritePending[trip.id]).toBeUndefined();
  await act(async () => { await store.setTripFavorite(trip.id, true); });
  expect(store.summaries[0].isFavorite).toBe(true);
});

test("duplicate intent shares a request while the opposite intent waits for it", async () => {
  await mount();
  const metadata = deferred<TripMetadataResult>();
  mockApi.updateTripMetadata.mockReturnValueOnce(metadata.promise);
  let first!: Promise<void>, duplicate!: Promise<void>, opposite!: Promise<void>;
  await act(async () => {
    first = store.setTripFavorite(trip.id, true);
    duplicate = store.setTripFavorite(trip.id, true);
    opposite = store.setTripFavorite(trip.id, false);
  });
  expect(first).toBe(duplicate);
  expect(mockApi.updateTripMetadata).toHaveBeenCalledTimes(1);
  await act(async () => { metadata.resolve({ id: trip.id, isFavorite: true, visited: false }); await opposite; });
  expect(mockApi.updateTripMetadata).toHaveBeenCalledTimes(2);
  expect(store.summaries[0].isFavorite).toBe(false);
  expect(store.favoritePending[trip.id]).toBeUndefined();
});

test("late metadata, detail, and list responses do not resurrect a deleted trip", async () => {
  await mount();
  const metadata = deferred<TripMetadataResult>();
  const detail = deferred<Trip>();
  mockApi.updateTripMetadata.mockReturnValueOnce(metadata.promise);
  mockApi.getTrip.mockReturnValueOnce(detail.promise);
  let saving!: Promise<void>, reading!: Promise<Trip>;
  await act(async () => { saving = store.setTripFavorite(trip.id, true); reading = store.loadTrip(trip.id); });
  // Attach the rejection handler before completing the deferred read.
  const readError = reading.catch((error: unknown) => error);
  await act(async () => { await store.deleteTrip(trip.id); });
  await act(async () => {
    metadata.resolve({ id: trip.id, isFavorite: true, visited: false });
    detail.resolve(trip);
    await saving;
    expect(await readError).toMatchObject({ status: 404 });
    await store.refresh();
    store.putTrip(trip);
  });
  expect(store.summaries).toEqual([]);
  expect(store.trips[trip.id]).toBeUndefined();
});

test("a failed collection read is distinct from empty and a retry clears the error", async () => {
  mockApi.listTrips.mockRejectedValueOnce(new Error("Storage unavailable"));
  await mount();
  expect(store.loadError).toBe("Storage unavailable");
  expect(store.hydrated).toBe(true);
  await act(async () => { await store.refresh(); });
  expect(store.loadError).toBeNull();
  expect(store.summaries).toHaveLength(1);
});
