import { beforeEach, expect, jest, test } from "@jest/globals";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetch } from "expo/fetch";
import { createRemoteApi } from "@/lib/api/remote";
import { DEFAULT_PREFS } from "@/domain/logic/labels";
import type { TripDraft } from "@/domain/types";

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
  expect(actual).toEqual(trip);
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

test("nearby search posts the position and returns the server ranking", async () => {
  await AsyncStorage.clear();
  const body = { source: "google", places: [] };
  mockFetch.mockResolvedValue(response(body));
  const res = await createRemoteApi("http://localhost:8000").nearbyPlaces({ lat: 41.88, lng: -87.62, radiusM: 2000, category: "food" });
  const [url, init] = mockFetch.mock.calls[0];
  expect(String(url)).toBe("http://localhost:8000/places/nearby/search");
  expect(init?.method).toBe("POST");
  expect(JSON.parse(init?.body as string)).toEqual({ lat: 41.88, lng: -87.62, radiusM: 2000, category: "food" });
  expect(res).toEqual(body);
});
