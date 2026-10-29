import { beforeEach, expect, jest, test } from "@jest/globals";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createLocalApi } from "@/lib/api/local";
import { createLocalSavedPlaceRepository } from "@/lib/api/localSavedPlaces";
import { savedPlaceKey } from "@/domain/logic/savedPlaces";
import type { SavedPlaceReference } from "@/domain/types";

jest.mock("expo-crypto", () => {
  let id = 0;
  return { randomUUID: () => `test-uuid-${++id}` };
});

const KEY = "wayfare.guest.savedPlaces.v1";
const place: SavedPlaceReference = { provider: "catalog", kind: "place", externalId: "ny-met" };
const getItem = jest.mocked(AsyncStorage.getItem).getMockImplementation()!;
const setItem = jest.mocked(AsyncStorage.setItem).getMockImplementation()!;

beforeEach(async () => {
  jest.mocked(AsyncStorage.getItem).mockReset().mockImplementation(getItem);
  jest.mocked(AsyncStorage.setItem).mockReset().mockImplementation(setItem);
  await AsyncStorage.clear();
});

test("repeated and concurrent saves across adapters return one persisted reference", async () => {
  const first = createLocalApi(), second = createLocalApi();
  const results = await Promise.all(Array.from({ length: 8 }, (_, index) => (index % 2 ? first : second).savePlace(place)));
  expect(new Set(results.map((item) => item.id)).size).toBe(1);
  expect(await createLocalApi().listSavedPlaces()).toEqual([results[0]]);
  expect(Object.keys(results[0]).sort()).toEqual(["createdAt", "externalId", "id", "kind", "provider"]);
  expect(await second.savePlace(place)).toEqual(results[0]);
});

test("provider, kind, case and opaque external IDs remain distinct", async () => {
  const api = createLocalApi();
  const references: SavedPlaceReference[] = [
    place, { ...place, provider: "google" }, { ...place, kind: "destination" },
    { ...place, externalId: place.externalId.toUpperCase() }, { ...place, externalId: 'opaque/:?[]"' },
    { ...place, externalId: "A".repeat(8000) },
  ];
  for (const reference of references) expect(await api.savePlace(reference)).toMatchObject({ ...reference });
  expect(await api.listSavedPlaces()).toHaveLength(references.length);
  expect(new Set(references.map(savedPlaceKey)).size).toBe(references.length);
});

test.each([
  {}, { ...place, provider: "other" }, { ...place, kind: "activity" }, { ...place, externalId: "" },
  { ...place, externalId: " ny-met" }, { ...place, externalId: "ny\nmet" }, { ...place, externalId: 1 },
  { ...place, userId: "another-user" }, { ...place, name: "A copied provider response" },
])("invalid input cannot create storage: %j", async (reference) => {
  await expect(createLocalApi().savePlace(reference as SavedPlaceReference)).rejects.toThrow();
  expect(await AsyncStorage.getItem(KEY)).toBeNull();
});

test("failed save and removal leave committed data intact and permit retry", async () => {
  const api = createLocalApi();
  jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error("Storage full"));
  await expect(api.savePlace(place)).rejects.toThrow("Storage full");
  expect(await api.listSavedPlaces()).toEqual([]);
  const saved = await api.savePlace(place);
  jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error("Storage full"));
  await expect(api.removeSavedPlace(saved.id)).rejects.toThrow("Storage full");
  expect(await createLocalApi().listSavedPlaces()).toEqual([saved]);
  await api.removeSavedPlace(saved.id);
  expect(await createLocalApi().listSavedPlaces()).toEqual([]);
  await expect(api.removeSavedPlace(saved.id)).rejects.toMatchObject({ status: 404 });
});

test("storage read failure is not an empty collection and cannot overwrite references", async () => {
  const api = createLocalApi();
  const saved = await api.savePlace(place);
  jest.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error("Storage unavailable"));
  await expect(api.listSavedPlaces()).rejects.toThrow("Storage unavailable");
  jest.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error("Storage unavailable"));
  await expect(api.savePlace({ ...place, externalId: "another" })).rejects.toThrow();
  expect(await api.listSavedPlaces()).toEqual([saved]);
});

test.each(["null", "{}", "{broken", '[{"broken":true}]'])("corrupt containers remain recoverable: %s", async (raw) => {
  await AsyncStorage.setItem(KEY, raw);
  const api = createLocalApi();
  await expect(api.listSavedPlaces()).rejects.toThrow();
  await expect(api.savePlace(place)).rejects.toThrow();
  expect(await AsyncStorage.getItem(KEY)).toBe(raw);
});

test("mixed records retain unknown fields and unreadable entries during mutations", async () => {
  const saved = await createLocalApi().savePlace(place);
  await AsyncStorage.setItem(KEY, JSON.stringify([{ ...saved, future: "keep" }, { broken: true }]));
  const api = createLocalApi();
  expect(await api.listSavedPlaces()).toEqual([{ ...saved, future: "keep" }]);
  await api.savePlace({ ...place, externalId: "another" });
  expect(JSON.parse((await AsyncStorage.getItem(KEY))!)).toEqual(expect.arrayContaining([{ ...saved, future: "keep" }, { broken: true }]));
});

test("an unavailable provider reference remains removable independently of trip deletion", async () => {
  const api = createLocalApi();
  const trip = await api.loadSample!();
  const saved = await api.savePlace({ provider: "google", kind: "place", externalId: "unavailable-id" });
  await api.deleteTrip(trip.id);
  expect(await createLocalApi().listSavedPlaces()).toEqual([saved]);
  await api.removeSavedPlace(saved.id);
  expect(await api.listSavedPlaces()).toEqual([]);
});

test("overlapping removal and insertion do not lose independent changes", async () => {
  const first = createLocalApi(), second = createLocalApi();
  const saved = await first.savePlace(place);
  const [, added] = await Promise.all([first.removeSavedPlace(saved.id), second.savePlace({ ...place, externalId: "another" })]);
  expect(await createLocalApi().listSavedPlaces()).toEqual([added]);
});

test("repository namespaces isolate data without claiming authenticated account isolation", async () => {
  const first = createLocalSavedPlaceRepository("guest-a"), second = createLocalSavedPlaceRepository("guest-b");
  const a = await first.save(place), b = await second.save(place);
  expect(a.id).not.toBe(b.id);
  await first.remove(a.id);
  expect(await second.list()).toEqual([b]);
});
