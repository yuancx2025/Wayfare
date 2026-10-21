import { fetch, type FetchRequestInit } from "expo/fetch";
import { randomUUID } from "expo-crypto";
import type { Api, GenerateOptions } from "./types";
import { ApiError } from "./types";
import { readEvents } from "./sse";
import type { Trip, TripDraft } from "@/domain/types";
import { GenerationError } from "@/domain/logic/generate";
import { storage } from "@/lib/storage";

const USER_KEY = "wayfare.userId";

let userIdPromise: Promise<string> | null = null;

/** One anonymous id per install, sent as `X-User-Id`. */
function userId(): Promise<string> {
  userIdPromise ??= (async () => {
    const existing = await storage.getItem(USER_KEY);
    if (existing) return existing;
    const id = `u-${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    await storage.setItem(USER_KEY, id);
    return id;
  })();
  return userIdPromise;
}

async function errorMessage(res: { status: number; json(): Promise<any> }): Promise<string> {
  try {
    const body = await res.json();
    const detail = body?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg).replace(/^Value error, /, "");
  } catch { /* not JSON */ }
  return `Request failed (${res.status})`;
}

export function createRemoteApi(base: string): Api {
  const root = base.replace(/\/$/, "");
  const headers = async (extra?: Record<string, string>) => ({ "X-User-Id": await userId(), ...extra });

  async function request<T>(path: string, init: FetchRequestInit = {}): Promise<T> {
    const res = await fetch(`${root}${path}`, {
      ...init,
      headers: await headers(init.body ? { "Content-Type": "application/json" } : undefined),
    });
    if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
    return (res.status === 204 ? undefined : await res.json()) as T;
  }
  const json = (method: string, body: unknown): FetchRequestInit => ({ method, body: JSON.stringify(body) });

  return {
    mode: "remote",
    capabilities: () => request("/health"),
    getMe: () => request("/me"),
    getPreferences: () => request("/me/preferences"),
    savePreferences: (prefs) => request("/me/preferences", json("PUT", prefs)),

    listTrips: () => request("/trips"),
    getTrip: (id) => request(`/trips/${encodeURIComponent(id)}`),
    deleteTrip: (id) => request(`/trips/${encodeURIComponent(id)}`, { method: "DELETE" }),

    async generateTrip(draft: TripDraft, { onStep, signal, idempotencyKey }: GenerateOptions): Promise<Trip> {
      // expo/fetch exposes the response body as a stream on native, which React Native's global fetch does not.
      const res = await fetch(`${root}/trips/generate`, {
        method: "POST",
        body: JSON.stringify(draft),
        signal,
        headers: await headers({
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        }),
      });
      if (!res.ok || !res.body) throw new GenerationError(await errorMessage(res));
      for await (const { event, data } of readEvents(res.body)) {
        if (event === "step") onStep(data.index);
        else if (event === "done") return data.trip as Trip;
        else if (event === "error") throw new GenerationError(data.message);
      }
      throw new GenerationError("The connection closed before your plan was ready.");
    },

    autocomplete: (q, session) => request(`/places/autocomplete?${new URLSearchParams({ q, session })}`),
    resolveDestination: (placeId) => request("/destinations/resolve", json("POST", { placeId })),
    listDestinations: (q) => request(`/destinations?${new URLSearchParams({ q })}`),
    nearbyPlaces: (req) => request("/places/nearby/search", json("POST", req)),
    async placeDetails(placeId, visit) {
      const qs = visit ? `?${new URLSearchParams({ date: visit.date, startMin: String(visit.startMin), durationMin: String(visit.durationMin) })}` : "";
      try {
        return await request(`/places/${encodeURIComponent(placeId)}${qs}`);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
    dayRoute: (tripId, day) => request(`/trips/${encodeURIComponent(tripId)}/days/${day}/route`),

    alternatives: (tripId, day, activityId) =>
      request(`/trips/${encodeURIComponent(tripId)}/days/${day}/activities/${encodeURIComponent(activityId)}/alternatives`),
    propose: (tripId, day, req) => request(`/trips/${encodeURIComponent(tripId)}/days/${day}/proposals`, json("POST", req)),
    applyProposal: (tripId, proposalId) =>
      request(`/trips/${encodeURIComponent(tripId)}/proposals/${encodeURIComponent(proposalId)}/apply`, { method: "POST" }),

    imageUrl: (src) => (src.startsWith("/") ? `${root}${src}` : src),
  };
}
