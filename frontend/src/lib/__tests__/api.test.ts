import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { resolveApiUrl } from "@/config";
import { readEvents } from "@/lib/api/sse";
import { createLocalApi } from "@/lib/api/local";
import { ApiError } from "@/lib/api/types";
import { addDays, todayISO } from "@/domain/lib/format";
import { DEFAULT_PREFS } from "@/domain/logic/labels";
import type { TripDraft } from "@/domain/types";

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      chunks.forEach((c) => controller.enqueue(enc.encode(c)));
      controller.close();
    },
  });
}

describe("readEvents", () => {
  test("parses CRLF event boundaries split between network chunks", async () => {
    const body = streamOf([
      'event: step\r\ndata: {"index":0}\r',
      '\n\r',
      '\nevent: done\r\ndata: {"trip":{"id":"t1"}}\r\n\r\n',
    ]);
    const out = [];
    for await (const event of readEvents(body)) out.push(event);
    expect(out).toEqual([
      { event: "step", data: { index: 0 } },
      { event: "done", data: { trip: { id: "t1" } } },
    ]);
  });

  test("parses events split across chunks and CRLF line endings", async () => {
    const body = streamOf([
      'event: step\r\ndata: {"index": 0}\r\n\r\nevent: st',
      'ep\ndata: {"index": 1}\n\n',
      'event: done\ndata: {"trip":\ndata: {"id": "t1"}}\n\n',
    ]);
    const out = [];
    for await (const e of readEvents(body)) out.push(e);
    expect(out).toEqual([
      { event: "step", data: { index: 0 } },
      { event: "step", data: { index: 1 } },
      { event: "done", data: { trip: { id: "t1" } } },
    ]);
  });
});

describe("resolveApiUrl", () => {
  test("leaves remote URLs and web alone", () => {
    expect(resolveApiUrl("https://api.example.com/", "ios", "192.168.1.5")).toBe("https://api.example.com");
    expect(resolveApiUrl("http://localhost:8000", "web", "192.168.1.5")).toBe("http://localhost:8000");
  });

  test("swaps localhost for the dev machine on devices", () => {
    expect(resolveApiUrl("http://localhost:8000", "ios", "192.168.1.5")).toBe("http://192.168.1.5:8000");
    expect(resolveApiUrl("http://127.0.0.1:8000", "android", undefined)).toBe("http://10.0.2.2:8000");
    expect(resolveApiUrl("http://localhost:8000", "android", "localhost")).toBe("http://10.0.2.2:8000");
  });

  test("treats an empty value as offline", () => {
    expect(resolveApiUrl("  ", "ios", undefined)).toBeUndefined();
    expect(resolveApiUrl(undefined, "ios", undefined)).toBeUndefined();
  });
});

describe("local api", () => {
  const start = addDays(todayISO(), 10);
  const draft: TripDraft = {
    destination: "Chicago, United States", destinationId: "chicago", startDate: start, endDate: addDays(start, 1),
    travelers: 2, prefs: { ...DEFAULT_PREFS, interests: ["food", "culture"] }, simulateFailure: false,
  };

  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.useFakeTimers();
  });

  async function generate(api: ReturnType<typeof createLocalApi>, d = draft) {
    const steps: number[] = [];
    const p = api.generateTrip(d, { onStep: (i) => steps.push(i) });
    await jest.runAllTimersAsync();
    return { trip: await p, steps };
  }

  test("starts empty, then lists a generated trip", async () => {
    const api = createLocalApi();
    expect(await api.listTrips()).toEqual([]);
    const { trip, steps } = await generate(api);
    expect(steps).toEqual([0, 1, 2, 3, 4]);
    const [summary] = await api.listTrips();
    expect(summary).toMatchObject({ id: trip.id, dayCount: 2, stopCount: trip.days[0].activities.length + trip.days[1].activities.length });
  });

  test("simulated failure rejects with the planner message", async () => {
    const api = createLocalApi();
    const p = api.generateTrip({ ...draft, simulateFailure: true }, { onStep: () => undefined });
    const settled = p.catch((e: Error) => e);
    await jest.runAllTimersAsync();
    expect(((await settled) as Error).message).toMatch(/timed out/);
  });

  test("propose then apply bumps the version and expires the proposal", async () => {
    const api = createLocalApi();
    const { trip } = await generate(api);
    const proposal = await api.propose(trip.id, 0, { kind: "more-food" });
    expect(proposal.proposalId).toBeDefined();
    const updated = await api.applyProposal(trip.id, proposal.proposalId!);
    expect(updated.adjusted).toBe(true);
    expect(updated.version).toBe(2);
    expect(updated.days[0].activities).toHaveLength(trip.days[0].activities.length + 1);
    await expect(api.applyProposal(trip.id, proposal.proposalId!)).rejects.toMatchObject({ status: 410 });
  });

  test("custom adjustments need the backend", async () => {
    const api = createLocalApi();
    const { trip } = await generate(api);
    await expect(api.propose(trip.id, 0, { kind: "custom", instruction: "more parks" })).rejects.toBeInstanceOf(ApiError);
  });

  test("loadSample adds the New York trip once", async () => {
    const api = createLocalApi();
    await api.loadSample!();
    await api.loadSample!();
    const list = await api.listTrips();
    expect(list.map((t) => t.id)).toEqual(["trip-nyc-seed"]);
  });

  test("drops stored trips that don't match the model", async () => {
    await AsyncStorage.setItem("wayfare.trips.v2", JSON.stringify([{ id: 1 }]));
    expect(await createLocalApi().listTrips()).toEqual([]);
  });
});

describe("local nearbyPlaces", () => {
  test("labels catalog results and rejects radii above 5 km", async () => {
    const api = createLocalApi();
    const res = await api.nearbyPlaces({ lat: 41.8796, lng: -87.6237, category: "food" });
    expect(res.source).toBe("catalog");
    expect(res.places.length).toBeGreaterThan(0);
    await expect(api.nearbyPlaces({ lat: 41.88, lng: -87.62, radiusM: 9000 })).rejects.toMatchObject({ status: 422 });
  });
});
