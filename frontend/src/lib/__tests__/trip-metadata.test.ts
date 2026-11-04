import { beforeEach, expect, jest, test } from "@jest/globals";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createLocalApi, historyFixtureTrips, sampleTrip } from "@/lib/api/local";
import type { TripMetadataPatch } from "@/domain/types";

const TRIPS_KEY = "wayfare.trips.v2";
const storedTrips = async () => JSON.parse((await AsyncStorage.getItem(TRIPS_KEY))!);
const getItemImplementation = jest.mocked(AsyncStorage.getItem).getMockImplementation()!;
const setItemImplementation = jest.mocked(AsyncStorage.setItem).getMockImplementation()!;

beforeEach(async () => {
  // These methods are already Jest mocks; mockRestore removes their implementation.
  jest.mocked(AsyncStorage.getItem).mockReset().mockImplementation(getItemImplementation);
  jest.mocked(AsyncStorage.setItem).mockReset().mockImplementation(setItemImplementation);
  await AsyncStorage.clear();
});

test("legacy trips acquire safe metadata defaults without a destructive read migration", async () => {
  const { isFavorite: _favorite, visited: _visited, ...legacy } = sampleTrip();
  const raw = JSON.stringify([{ id: "unreadable" }, { ...legacy, futureField: "keep me" }]);
  await AsyncStorage.setItem(TRIPS_KEY, raw);
  const api = createLocalApi();
  expect(await api.listTrips()).toEqual([expect.objectContaining({ id: legacy.id, isFavorite: false, visited: false })]);
  expect(await api.getTrip(legacy.id)).toMatchObject({ isFavorite: false, visited: false, futureField: "keep me" });
  expect(await AsyncStorage.getItem(TRIPS_KEY)).toBe(raw);

  await api.updateTripMetadata(legacy.id, { isFavorite: true });
  expect(await storedTrips()).toEqual(expect.arrayContaining([
    { id: "unreadable" }, expect.objectContaining({ id: legacy.id, futureField: "keep me", isFavorite: true, visited: false }),
  ]));
});

test("new and past-dated trips start neither favorited nor visited", async () => {
  expect(sampleTrip()).toMatchObject({ isFavorite: false, visited: false });
  const past = historyFixtureTrips("2030-01-01")[0];
  expect(past.endDate < "2030-01-01").toBe(true);
  expect(past).toMatchObject({ isFavorite: false, visited: false });
  const api = createLocalApi();
  await api.loadHistoryFixtures!();
  expect((await api.listTrips()).every((trip) => !trip.isFavorite && !trip.visited)).toBe(true);
});

test("explicit favorite values survive restart and leave all itinerary data unchanged", async () => {
  const api = createLocalApi();
  const sample = { ...sampleTrip(), version: 7 };
  await AsyncStorage.setItem(TRIPS_KEY, JSON.stringify([sample]));
  expect(await api.updateTripMetadata(sample.id, { isFavorite: true })).toEqual({ id: sample.id, isFavorite: true, visited: false });
  // A retry sets the same value; it must not toggle the favorite back off.
  await api.updateTripMetadata(sample.id, { isFavorite: true });
  const restarted = createLocalApi();
  expect(await restarted.getTrip(sample.id)).toEqual({ ...sample, isFavorite: true });
  expect(await restarted.listTrips()).toEqual([expect.objectContaining({ isFavorite: true, visited: false })]);
  await restarted.updateTripMetadata(sample.id, { isFavorite: false });
  expect(await createLocalApi().getTrip(sample.id)).toEqual(sample);
});

test.each([{}, { isFavorite: undefined }, { isFavorite: null }, { isFavorite: "true" }, { version: 9 }, { isFavorite: true, visited: undefined }])(
  "invalid metadata patches cannot change stored trips: %j", async (patch) => {
    const api = createLocalApi();
    const trip = await api.loadSample!();
    const before = await AsyncStorage.getItem(TRIPS_KEY);
    await expect(api.updateTripMetadata(trip.id, patch as TripMetadataPatch)).rejects.toThrow();
    expect(await AsyncStorage.getItem(TRIPS_KEY)).toBe(before);
  },
);

test("a missing trip returns 404 instead of creating a favorite record", async () => {
  await expect(createLocalApi().updateTripMetadata("missing", { isFavorite: true })).rejects.toMatchObject({ status: 404 });
  expect(await AsyncStorage.getItem(TRIPS_KEY)).toBeNull();
});

test("failed writes preserve committed data and the queue accepts a retry", async () => {
  const api = createLocalApi();
  const trip = await api.loadSample!();
  const setItem = jest.spyOn(AsyncStorage, "setItem").mockRejectedValueOnce(new Error("Storage is full"));
  try {
    await expect(api.updateTripMetadata(trip.id, { isFavorite: true })).rejects.toThrow("Storage is full");
    expect(await api.getTrip(trip.id)).toEqual(trip);
    expect(await createLocalApi().getTrip(trip.id)).toEqual(trip);
    await api.updateTripMetadata(trip.id, { isFavorite: true });
    expect(await api.getTrip(trip.id)).toMatchObject({ isFavorite: true });
  } finally { setItem.mockRestore(); }
});

test("a failed read is recoverable and cannot masquerade as an empty collection", async () => {
  const api = createLocalApi();
  const trip = await api.loadSample!();
  const getItem = jest.spyOn(AsyncStorage, "getItem").mockRejectedValueOnce(new Error("Storage unavailable"));
  try {
    await expect(api.listTrips()).rejects.toThrow("Storage unavailable");
    expect(await api.listTrips()).toEqual([expect.objectContaining({ id: trip.id })]);
    getItem.mockRejectedValueOnce(new Error("Storage unavailable"));
    await expect(api.updateTripMetadata(trip.id, { isFavorite: true })).rejects.toThrow("Storage unavailable");
    expect(await api.getTrip(trip.id)).toEqual(trip);
  } finally { getItem.mockRestore(); }
});

test.each(["{broken JSON", "null", JSON.stringify({ trips: [] })])("unreadable collection containers are not overwritten: %s", async (raw) => {
  await AsyncStorage.setItem(TRIPS_KEY, raw);
  const api = createLocalApi();
  await expect(api.listTrips()).rejects.toThrow();
  await expect(api.loadSample!()).rejects.toThrow();
  expect(await AsyncStorage.getItem(TRIPS_KEY)).toBe(raw);
});

test("overlapping adapters preserve independent edits, deletions, and inserted trips", async () => {
  const first = createLocalApi();
  const second = createLocalApi();
  const fixtures = await first.loadHistoryFixtures!();
  await second.listTrips();
  await Promise.all([
    first.updateTripMetadata(fixtures[0].id, { isFavorite: true }),
    second.updateTripMetadata(fixtures[0].id, { visited: true }),
    second.updateTripMetadata(fixtures[1].id, { isFavorite: true }),
    first.deleteTrip(fixtures[2].id),
    second.loadSample!(),
  ]);
  const restarted = createLocalApi();
  expect(await restarted.getTrip(fixtures[0].id)).toMatchObject({ isFavorite: true, visited: true });
  expect(await restarted.getTrip(fixtures[1].id)).toMatchObject({ isFavorite: true });
  await expect(restarted.getTrip(fixtures[2].id)).rejects.toMatchObject({ status: 404 });
  expect(await restarted.getTrip("trip-nyc-seed")).toBeDefined();
  expect(await restarted.listTrips()).toHaveLength(fixtures.length);
});

test.each([true, false])("favorites and itinerary adjustments do not overwrite each other (favorite first: %s)", async (favoriteFirst) => {
  const api = createLocalApi();
  const trip = await api.loadSample!();
  const proposal = await api.propose(trip.id, 0, { kind: "more-food" });
  const favorite = () => api.updateTripMetadata(trip.id, { isFavorite: true });
  const apply = () => api.applyProposal(trip.id, proposal.proposalId!);
  await Promise.all(favoriteFirst ? [favorite(), apply()] : [apply(), favorite()]);
  const result = await createLocalApi().getTrip(trip.id);
  expect(result).toMatchObject({ isFavorite: true, visited: false, adjusted: true, version: 2 });
  expect(result.days[0]).toEqual(proposal.day);
});

test("failed itinerary writes preserve the proposal for a successful retry", async () => {
  const api = createLocalApi();
  const trip = await api.loadSample!();
  const proposal = await api.propose(trip.id, 0, { kind: "more-food" });
  const setItem = jest.spyOn(AsyncStorage, "setItem").mockRejectedValueOnce(new Error("Storage is full"));
  try {
    await expect(api.applyProposal(trip.id, proposal.proposalId!)).rejects.toThrow("Storage is full");
    expect(await api.getTrip(trip.id)).toEqual(trip);
    expect(await api.applyProposal(trip.id, proposal.proposalId!)).toMatchObject({ version: 2 });
    await expect(api.applyProposal(trip.id, proposal.proposalId!)).rejects.toMatchObject({ status: 410 });
  } finally { setItem.mockRestore(); }
});

test("concurrent applications consume a proposal only once", async () => {
  const api = createLocalApi();
  const trip = await api.loadSample!();
  const proposal = await api.propose(trip.id, 0, { kind: "more-food" });
  const results = await Promise.allSettled([
    api.applyProposal(trip.id, proposal.proposalId!), api.applyProposal(trip.id, proposal.proposalId!),
  ]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { status: 410 } });
  expect(await api.getTrip(trip.id)).toMatchObject({ version: 2 });
});

test("refreshing history fixtures preserves favorites and explicit visits", async () => {
  const api = createLocalApi();
  const [trip] = await api.loadHistoryFixtures!();
  await api.updateTripMetadata(trip.id, { isFavorite: true, visited: true });
  await api.loadHistoryFixtures!();
  expect(await createLocalApi().getTrip(trip.id)).toMatchObject({ isFavorite: true, visited: true });
});
