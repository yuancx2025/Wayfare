import { fetch, type FetchRequestInit } from "expo/fetch";
import { randomUUID } from "expo-crypto";
import type { Api, GenerateOptions } from "./types";
import { ApiError } from "./types";
import { readEvents } from "./sse";
import type { Trip, TripDraft, TripSummary } from "@/domain/types";
import { GenerationError } from "@/domain/logic/generate";
import { storage } from "@/lib/storage";
import { withTripMetadata } from "@/domain/logic/tripMetadata";
import { tripMetadataPatchSchema, tripMetadataResultSchema } from "@/domain/schemas";

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

function cleanMessage(msg: unknown): string {
  return String(msg ?? "").replace(/^Value error, /, "");
}

function fieldFromLoc(loc: unknown): string | undefined {
  if (!Array.isArray(loc)) return undefined;
  const parts = loc.filter((part): part is string => typeof part === "string" && part !== "body");
  return parts.at(-1);
}

async function readError(res: { status: number; json(): Promise<any> }): Promise<{ message: string; fieldErrors?: Record<string, string> }> {
  try {
    const body = await res.json();
    const detail = body?.detail;
    if (typeof detail === "string") return { message: detail };
    if (Array.isArray(detail)) {
      const fieldErrors: Record<string, string> = {};
      for (const item of detail) {
        const field = fieldFromLoc(item?.loc);
        const message = cleanMessage(item?.msg);
        if (field && message && fieldErrors[field] === undefined) fieldErrors[field] = message;
      }
      const message = detail[0]?.msg ? cleanMessage(detail[0].msg) : `Request failed (${res.status})`;
      return Object.keys(fieldErrors).length ? { message, fieldErrors } : { message };
    }
  } catch { /* not JSON */ }
  return { message: `Request failed (${res.status})` };
}

export function createRemoteApi(base: string): Api {
  const root = base.replace(/\/$/, "");
  const headers = async (extra?: Record<string, string>) => ({ "X-User-Id": await userId(), ...extra });

  async function request<T>(path: string, init: FetchRequestInit = {}): Promise<T> {
    const res = await fetch(`${root}${path}`, {
      ...init,
      headers: await headers(init.body ? { "Content-Type": "application/json" } : undefined),
    });
    if (!res.ok) {
      const parsed = await readError(res);
      throw new ApiError(res.status, parsed.message, parsed.fieldErrors);
    }
    return (res.status === 204 ? undefined : await res.json()) as T;
  }
  const json = (method: string, body: unknown): FetchRequestInit => ({ method, body: JSON.stringify(body) });

  return {
    mode: "remote",
    capabilities: () => request("/health"),
    getMe: () => request("/me"),
    updateProfile: (patch) => request("/me", json("PATCH", patch)),
    getPreferences: () => request("/me/preferences"),
    savePreferences: (prefs) => request("/me/preferences", json("PUT", prefs)),

    listTrips: async () => (await request<TripSummary[]>("/trips")).map(withTripMetadata),
    getTrip: async (id) => withTripMetadata(await request<Trip>(`/trips/${encodeURIComponent(id)}`)),
    async updateTripMetadata(id, patch) {
      const metadata = tripMetadataPatchSchema.parse(patch);
      const result = tripMetadataResultSchema.parse(await request(`/trips/${encodeURIComponent(id)}`, json("PATCH", metadata)));
      if (result.id !== id) throw new ApiError(502, "The metadata response belongs to a different trip.");
      return result;
    },
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
      if (!res.ok || !res.body) throw new GenerationError((await readError(res)).message);
      for await (const { event, data } of readEvents(res.body)) {
        if (event === "step") onStep(data.index);
        else if (event === "done") return withTripMetadata(data.trip as Trip);
        else if (event === "error") throw new GenerationError(data.message);
      }
      throw new GenerationError("The connection closed before your plan was ready.");
    },

    autocomplete: (q, session) => request(`/places/autocomplete?${new URLSearchParams({ q, session })}`),
    resolveDestination: (placeId) => request("/destinations/resolve", json("POST", { placeId })),
    listDestinations: (q) => request(`/destinations?${new URLSearchParams({ q })}`),
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
    applyProposal: async (tripId, proposalId) => withTripMetadata(
      await request<Trip>(`/trips/${encodeURIComponent(tripId)}/proposals/${encodeURIComponent(proposalId)}/apply`, { method: "POST" }),
    ),

    imageUrl: (src) => (src.startsWith("/") ? `${root}${src}` : src),
  };
}
