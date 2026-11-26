import React, { act } from "react";
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SavedPlace, SavedPlaceReference } from "@/domain/types";
import { type Api, ApiError } from "@/lib/api";
import { savedPlacesQueryKey, setPlaceSaved, useSavedPlaces } from "@/lib/savedPlaces";

jest.mock("@/auth/session", () => ({ useAuthSession: () => mockSession }));
jest.mock("@/lib/api", () => ({
  ApiError: jest.requireActual<typeof import("@/lib/api/types")>("@/lib/api/types").ApiError,
  api: { mode: "local", listSavedPlaces: jest.fn(), savePlace: jest.fn(), removeSavedPlace: jest.fn(), getSavedPlaceDetails: jest.fn() },
  useApi: () => jest.requireMock<{ api: unknown }>("@/lib/api").api,
}));

const api = jest.requireMock<{ api: Api }>("@/lib/api").api;
const mockSession: { mode: string; userId: string | null } = { mode: "guest", userId: null };
const mockApi = jest.mocked(api);
const reference: SavedPlaceReference = { provider: "catalog", kind: "place", externalId: "ny-met" };
const saved: SavedPlace = { ...reference, id: "saved-1", createdAt: 10 };
let client: QueryClient;
let screen: ReactTestRenderer | undefined;
let query: ReturnType<typeof useSavedPlaces>;
function Probe() { const value = useSavedPlaces(); React.useEffect(() => { query = value; }, [value]); return null; }
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { resolve, reject, promise };
}
const data = () => client.getQueryData<SavedPlace[]>(savedPlacesQueryKey("guest"));
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
async function mount() {
  await act(async () => { screen = create(React.createElement(QueryClientProvider, { client }, React.createElement(Probe))); });
  await flush();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSession.mode = "guest";
  mockSession.userId = null;
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  mockApi.listSavedPlaces.mockReset().mockResolvedValue([]);
  mockApi.savePlace.mockReset().mockResolvedValue(saved);
  mockApi.removeSavedPlace.mockReset().mockResolvedValue(undefined);
});
afterEach(async () => { if (screen) await act(async () => screen!.unmount()); screen = undefined; client.clear(); });

test("matching writes coalesce, stay pending until persistence, and strip record-only fields", async () => {
  client.setQueryData(savedPlacesQueryKey("guest"), []);
  const request = deferred<SavedPlace>();
  mockApi.savePlace.mockReturnValueOnce(request.promise);
  const first = setPlaceSaved(client, api, "guest", saved, true);
  expect(setPlaceSaved(client, api, "guest", reference, true)).toBe(first);
  await flush();
  expect(data()).toEqual([]);
  expect(mockApi.savePlace).toHaveBeenCalledTimes(1);
  expect(mockApi.savePlace).toHaveBeenCalledWith(reference);
  request.resolve(saved); await first;
  expect(data()).toEqual([saved]);
});

test.each(["before", "during"])("a list read started %s a removal cannot resurrect the saved record", async (timing) => {
  mockApi.listSavedPlaces.mockResolvedValue([saved]);
  await mount();
  const read = deferred<SavedPlace[]>(), removal = deferred<void>();
  mockApi.listSavedPlaces.mockReturnValueOnce(read.promise);
  mockApi.removeSavedPlace.mockReturnValueOnce(removal.promise);
  let reading!: ReturnType<typeof query.refetch>, writing!: Promise<void>;
  await act(async () => {
    if (timing === "before") reading = query.refetch();
    writing = setPlaceSaved(client, api, "guest", reference, false);
  });
  if (timing === "during") await act(async () => { reading = query.refetch(); });
  removal.resolve(undefined); await act(async () => { await writing; });
  read.resolve([saved]); await act(async () => { await reading; });
  await flush();
  expect(data()).toEqual([]);
});

test("independent concurrent saves merge rather than replace the collection", async () => {
  client.setQueryData(savedPlacesQueryKey("guest"), []);
  const other = { ...saved, id: "saved-2", externalId: "ny-moma", createdAt: 20 };
  mockApi.savePlace.mockResolvedValueOnce(saved).mockResolvedValueOnce(other);
  await Promise.all([setPlaceSaved(client, api, "guest", reference, true), setPlaceSaved(client, api, "guest", other, true)]);
  expect(data()).toEqual([other, saved]);
});

test("opposing intent waits and failed writes preserve the previous collection for retry", async () => {
  client.setQueryData(savedPlacesQueryKey("guest"), []);
  const request = deferred<SavedPlace>();
  mockApi.savePlace.mockReturnValueOnce(request.promise);
  const first = setPlaceSaved(client, api, "guest", reference, true);
  const opposite = setPlaceSaved(client, api, "guest", reference, false);
  request.resolve(saved); await Promise.all([first, opposite]);
  expect(data()).toEqual([]);
  client.setQueryData(savedPlacesQueryKey("guest"), [saved]);
  mockApi.removeSavedPlace.mockRejectedValueOnce(new ApiError(503, "Offline"));
  await expect(setPlaceSaved(client, api, "guest", reference, false)).rejects.toThrow("Offline");
  expect(data()).toEqual([saved]);
  mockApi.removeSavedPlace.mockRejectedValueOnce(new ApiError(404, "Already removed"));
  await setPlaceSaved(client, api, "guest", reference, false);
  expect(data()).toEqual([]);
});

test("an unread collection cannot be treated as empty and a cleared cache is not recreated", async () => {
  await expect(setPlaceSaved(client, api, "guest", reference, true)).rejects.toThrow("Load saved places");
  expect(mockApi.savePlace).not.toHaveBeenCalled();
  client.setQueryData(savedPlacesQueryKey("guest"), []);
  const request = deferred<SavedPlace>();
  mockApi.savePlace.mockReturnValueOnce(request.promise);
  const saving = setPlaceSaved(client, api, "guest", reference, true);
  await flush(); client.clear(); request.resolve(saved); await saving;
  expect(data()).toBeUndefined();
});

test("a late account write cannot update another account's cache or share its pending request", async () => {
  const a = "account:user_a", b = "account:user_b";
  client.setQueryData(savedPlacesQueryKey(a), []);
  client.setQueryData(savedPlacesQueryKey(b), []);
  const oldWrite = deferred<SavedPlace>();
  const other = { ...saved, id: "saved-b" };
  mockApi.savePlace.mockReturnValueOnce(oldWrite.promise).mockResolvedValueOnce(other);
  const writingA = setPlaceSaved(client, api, a, reference, true);
  await flush();
  await setPlaceSaved(client, api, b, reference, true);
  expect(mockApi.savePlace).toHaveBeenCalledTimes(2);
  expect(client.getQueryData(savedPlacesQueryKey(a))).toEqual([]);
  expect(client.getQueryData(savedPlacesQueryKey(b))).toEqual([other]);
  oldWrite.resolve(saved); await writingA;
  expect(client.getQueryData(savedPlacesQueryKey(b))).toEqual([other]);
});

test("account changes and guest mode read distinct collections even with one query client", async () => {
  mockSession.mode = "account"; mockSession.userId = "user_a";
  mockApi.listSavedPlaces.mockResolvedValueOnce([saved]).mockResolvedValue([]);
  await mount();
  expect(query.data).toEqual([saved]);
  mockSession.userId = "user_b";
  await act(async () => { screen!.update(React.createElement(QueryClientProvider, { client }, React.createElement(Probe))); });
  await flush();
  expect(query.data).toEqual([]);
  mockSession.mode = "guest"; mockSession.userId = null;
  await act(async () => { screen!.update(React.createElement(QueryClientProvider, { client }, React.createElement(Probe))); });
  await flush();
  expect(query.data).toEqual([]);
  expect(client.getQueryData(savedPlacesQueryKey("account:user_a"))).toEqual([saved]);
});
