import { beforeEach, expect, jest, test } from "@jest/globals";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetch } from "expo/fetch";
import { createRemoteApi as createRemote, type GetToken } from "@/lib/api/remote";
import { DEFAULT_PREFS } from "@/domain/logic/labels";
import type { TripDraft } from "@/domain/types";

jest.mock("expo/fetch", () => ({ fetch: jest.fn() }));

const mockFetch = fetch as jest.MockedFunction<typeof fetch>;
const createRemoteApi = (base: string) => createRemote(base, async () => "session-jwt");
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

const headersOf = (call: number) => mockFetch.mock.calls[call][1]?.headers as Record<string, string>;

test("requests carry the Clerk session token and no install id", async () => {
  await AsyncStorage.clear();
  mockFetch.mockResolvedValue(response([]));
  await createRemoteApi("http://localhost:8000").listTrips();
  expect(headersOf(0)).toEqual({ Authorization: "Bearer session-jwt" });
  expect(await AsyncStorage.getAllKeys()).toEqual([]);
});

test("a 401 is retried once with a freshly minted token", async () => {
  const getToken = jest.fn<GetToken>(async (options) => (options?.skipCache ? "fresh-jwt" : "stale-jwt"));
  const onSessionEnded = jest.fn();
  mockFetch.mockResolvedValueOnce(response({ detail: "Your session is invalid or has expired" }, 401));
  mockFetch.mockResolvedValueOnce(response([{ id: "trip-1" }]));

  expect(await createRemote("http://localhost:8000", getToken, onSessionEnded).listTrips()).toEqual([{ id: "trip-1" }]);
  expect(getToken.mock.calls).toEqual([[undefined], [{ skipCache: true }]]);
  expect([headersOf(0).Authorization, headersOf(1).Authorization]).toEqual(["Bearer stale-jwt", "Bearer fresh-jwt"]);
  expect(onSessionEnded).not.toHaveBeenCalled();
});

test("a second 401 ends the session without saving anything locally", async () => {
  await AsyncStorage.clear();
  const onSessionEnded = jest.fn();
  mockFetch.mockResolvedValue(response({ detail: "Sign in required" }, 401));
  const api = createRemote("http://localhost:8000", async () => null, onSessionEnded);

  await expect(api.savePreferences(DEFAULT_PREFS)).rejects.toMatchObject({ status: 401, message: "Your session ended. Sign in again." });
  expect(mockFetch).toHaveBeenCalledTimes(2);
  expect(headersOf(1)).toEqual({ "Content-Type": "application/json" });
  expect(onSessionEnded).toHaveBeenCalledTimes(1);
  expect(await AsyncStorage.getAllKeys()).toEqual([]);
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
    headers: expect.objectContaining({ Accept: "text/event-stream", "Idempotency-Key": "retry-identity", Authorization: "Bearer session-jwt" }),
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
