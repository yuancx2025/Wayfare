import { beforeEach, expect, jest, test } from "@jest/globals";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetch } from "expo/fetch";
import { createRemoteApi } from "@/lib/api/remote";
import { DEFAULT_PREFS } from "@/domain/logic/labels";
import type { SavedPlaceReference, TripDraft, TripMetadataPatch } from "@/domain/types";

jest.mock("expo/fetch", () => ({ fetch: jest.fn() }));
jest.mock("expo-crypto", () => ({ randomUUID: () => "12345678-1234-1234-1234-123456789abc" }));

const mockFetch = fetch as jest.MockedFunction<typeof fetch>;
const draft: TripDraft = {
  destination: "Chicago", destinationId: "chicago", startDate: "2030-06-10", endDate: "2030-06-10",
  travelers: 1, prefs: DEFAULT_PREFS, simulateFailure: false,
};

function response(body: unknown, status = 200, stream?: ReadableStream<Uint8Array<ArrayBuffer>>) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, body: stream } as unknown as Awaited<ReturnType<typeof fetch>>;
}

function events(text: string) {
  return new ReadableStream<Uint8Array<ArrayBuffer>>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

beforeEach(() => { mockFetch.mockReset(); });

test("requests keep one anonymous identity across API instances", async () => {
  await AsyncStorage.clear();
  mockFetch.mockResolvedValue(response([]));
  await createRemoteApi("http://localhost:8000").listTrips();
  await createRemoteApi("http://localhost:8000").getMe();
  const first = mockFetch.mock.calls[0][1]?.headers as Record<string, string>;
  const second = mockFetch.mock.calls[1][1]?.headers as Record<string, string>;
  expect(first["X-User-Id"]).toMatch(/^u-/);
  expect(second["X-User-Id"]).toBe(first["X-User-Id"]);
  expect(await AsyncStorage.getItem("wayfare.userId")).toBe(first["X-User-Id"]);
});

test("generation streams progress and passes cancellation and retry identity to the server", async () => {
  const trip = { id: "saved-trip", days: [] };
  mockFetch.mockResolvedValue(response({}, 200, events(
    'event: step\ndata: {"index":1}\n\nevent: done\ndata: ' + JSON.stringify({ trip }) + '\n\n',
  )));
  const onStep = jest.fn();
  const ctrl = new AbortController();
  const actual = await createRemoteApi("http://localhost:8000/").generateTrip(draft, {
    onStep, signal: ctrl.signal, idempotencyKey: "retry-identity",
  });
  expect(actual).toEqual({ ...trip, isFavorite: false, visited: false });
  expect(onStep).toHaveBeenCalledWith(1);
  expect(mockFetch).toHaveBeenCalledWith("http://localhost:8000/trips/generate", expect.objectContaining({
    signal: ctrl.signal,
    headers: expect.objectContaining({ Accept: "text/event-stream", "Idempotency-Key": "retry-identity" }),
  }));
});

test("a dropped generation stream is a failure rather than a completed trip", async () => {
  mockFetch.mockResolvedValue(response({}, 200, events('event: step\ndata: {"index":0}\n\n')));
  await expect(createRemoteApi("http://localhost:8000").generateTrip(draft, { onStep: () => undefined }))
    .rejects.toThrow("connection closed before your plan was ready");
});

test("server generation errors reach the retry screen", async () => {
  mockFetch.mockResolvedValue(response({}, 200, events('event: error\ndata: {"message":"Planner unavailable"}\n\n')));
  await expect(createRemoteApi("http://localhost:8000").generateTrip(draft, { onStep: () => undefined }))
    .rejects.toThrow("Planner unavailable");
});

test.each([409, 410])("proposal status %s remains available to the preview UI", async (status) => {
  mockFetch.mockResolvedValue(response({ detail: "Refresh this preview" }, status));
  await expect(createRemoteApi("http://localhost:8000").applyProposal("trip-1", "proposal-1"))
    .rejects.toMatchObject({ status, message: "Refresh this preview" });
});

test("profile validation errors expose a field for each 422 entry", async () => {
  await AsyncStorage.clear();
  mockFetch.mockResolvedValue(response({
    detail: [
      { loc: ["body", "name"], msg: "String should have at least 1 character" },
      { loc: ["body", "home"], msg: "Value error, must not be null" },
    ],
  }, 422));
  const patch = { name: "", home: "" };
  await expect(createRemoteApi("http://localhost:8000").updateProfile(patch)).rejects.toMatchObject({
    status: 422,
    message: "String should have at least 1 character",
    fieldErrors: {
      name: "String should have at least 1 character",
      home: "must not be null",
    },
  });
  expect(mockFetch).toHaveBeenCalledWith("http://localhost:8000/me", expect.objectContaining({
    method: "PATCH",
    body: JSON.stringify(patch),
  }));
});

test("optional place details handle missing places but surface provider failures", async () => {
  mockFetch.mockResolvedValueOnce(response({ detail: "Not found" }, 404));
  mockFetch.mockResolvedValueOnce(response({ detail: "Places unavailable" }, 502));
  const api = createRemoteApi("http://localhost:8000");
  expect(await api.placeDetails("missing")).toBeNull();
  await expect(api.placeDetails("upstream-error")).rejects.toMatchObject({ status: 502 });
});

test("legacy trip reads default metadata and preserve values supplied by a newer backend", async () => {
  const api = createRemoteApi("http://localhost:8000");
  mockFetch.mockResolvedValueOnce(response([{ id: "legacy" }, { id: "new", isFavorite: true, visited: true }]));
  expect(await api.listTrips()).toEqual([
    { id: "legacy", isFavorite: false, visited: false }, { id: "new", isFavorite: true, visited: true },
  ]);
  mockFetch.mockResolvedValueOnce(response({ id: "legacy", version: 7 }));
  expect(await api.getTrip("legacy")).toEqual({ id: "legacy", version: 7, isFavorite: false, visited: false });
  mockFetch.mockResolvedValueOnce(response({ id: "new", version: 8, isFavorite: true, visited: false }));
  expect(await api.applyProposal("new", "preview")).toMatchObject({ version: 8, isFavorite: true, visited: false });
});

test("metadata PATCH sends an explicit value and exposes only metadata in the response", async () => {
  const api = createRemoteApi("http://localhost:8000/");
  mockFetch.mockResolvedValue(response({ id: "trip/a", isFavorite: true, visited: false, version: 1, days: [] }));
  expect(await api.updateTripMetadata("trip/a", { isFavorite: true })).toEqual({ id: "trip/a", isFavorite: true, visited: false });
  expect(mockFetch).toHaveBeenCalledWith("http://localhost:8000/trips/trip%2Fa", expect.objectContaining({
    method: "PATCH", body: JSON.stringify({ isFavorite: true }),
    headers: expect.objectContaining({ "Content-Type": "application/json" }),
  }));
});

test.each([{}, { isFavorite: null }, { isFavorite: "true" }, { days: [] }])("invalid metadata never reaches the network: %j", async (patch) => {
  await expect(createRemoteApi("http://localhost:8000").updateTripMetadata("trip", patch as TripMetadataPatch)).rejects.toThrow();
  expect(mockFetch).not.toHaveBeenCalled();
});

test.each([401, 404, 405, 500])("metadata errors propagate without a guest-storage fallback: %s", async (status) => {
  await AsyncStorage.clear();
  mockFetch.mockResolvedValue(response({ detail: "Metadata unavailable" }, status));
  await expect(createRemoteApi("http://localhost:8000").updateTripMetadata("trip", { isFavorite: true }))
    .rejects.toMatchObject({ status, message: "Metadata unavailable" });
  expect(await AsyncStorage.getItem("wayfare.trips.v2")).toBeNull();
});

test.each([{ id: "other", isFavorite: true, visited: false }, { id: "trip", isFavorite: true }])(
  "an incomplete or mismatched metadata response is rejected: %j", async (body) => {
    mockFetch.mockResolvedValue(response(body));
    await expect(createRemoteApi("http://localhost:8000").updateTripMetadata("trip", { isFavorite: true })).rejects.toThrow();
  },
);

const savedReference: SavedPlaceReference = { provider: "google", kind: "destination", externalId: "opaque-provider-id" };
const savedPlace = { ...savedReference, id: "saved-1", createdAt: 1000 };

test("saved places use the shared identity transport and encoded removal ID", async () => {
  const api = createRemoteApi("http://localhost:8000/");
  mockFetch.mockResolvedValueOnce(response(savedPlace)).mockResolvedValueOnce(response([savedPlace])).mockResolvedValueOnce(response(undefined, 204));
  expect(await api.savePlace(savedReference)).toEqual(savedPlace);
  expect(await api.listSavedPlaces()).toEqual([savedPlace]);
  await api.removeSavedPlace("saved/id?");
  expect(mockFetch).toHaveBeenNthCalledWith(1, "http://localhost:8000/me/saved-places", expect.objectContaining({
    method: "POST", body: JSON.stringify(savedReference), headers: expect.objectContaining({ "X-User-Id": expect.any(String) }),
  }));
  expect(mockFetch).toHaveBeenLastCalledWith("http://localhost:8000/me/saved-places/saved%2Fid%3F", expect.objectContaining({ method: "DELETE" }));
});

test("invalid saved input rejects before a request and mismatched responses never report success", async () => {
  const api = createRemoteApi("http://localhost:8000");
  await expect(api.savePlace({ ...savedReference, owner: "other" } as SavedPlaceReference)).rejects.toThrow();
  expect(mockFetch).not.toHaveBeenCalled();
  mockFetch.mockResolvedValueOnce(response({ ...savedPlace, kind: "place" }));
  await expect(api.savePlace(savedReference)).rejects.toMatchObject({ status: 502 });
  mockFetch.mockResolvedValueOnce(response([{ ...savedPlace, externalId: null }]));
  await expect(api.listSavedPlaces()).rejects.toThrow();
});

test("remote saved-place failures never fall back to guest storage or an empty result", async () => {
  const api = createRemoteApi("http://localhost:8000");
  await AsyncStorage.removeItem("wayfare.guest.savedPlaces.v1");
  mockFetch.mockRejectedValueOnce(new Error("Offline"));
  await expect(api.savePlace(savedReference)).rejects.toThrow("Offline");
  expect(await AsyncStorage.getItem("wayfare.guest.savedPlaces.v1")).toBeNull();
  mockFetch.mockResolvedValueOnce(response({ detail: "Unavailable" }, 503));
  await expect(api.listSavedPlaces()).rejects.toMatchObject({ status: 503 });
  mockFetch.mockResolvedValueOnce(response({ detail: "Saved place not found" }, 404));
  await expect(api.removeSavedPlace(savedPlace.id)).rejects.toMatchObject({ status: 404 });
});
