import { fetch, type FetchRequestInit } from "expo/fetch";
import type { Api, GenerateOptions } from "./types";
import { ApiError } from "./types";
import { readEvents } from "./sse";
import type { Trip, TripDraft } from "@/domain/types";
import { GenerationError } from "@/domain/logic/generate";

/** Clerk's `useAuth().getToken`: the current session JWT, or null when signed out. */
export type GetToken = (options?: { skipCache?: boolean }) => Promise<string | null>;

export const SESSION_ENDED = "Your session ended. Sign in again.";

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

/**
 * Every request carries the Clerk session token. A 401 is retried once with a freshly minted token; a second 401
 * means the session itself is gone, so `onSessionEnded` runs and the call fails.
 */
export function createRemoteApi(base: string, getToken: GetToken, onSessionEnded?: () => void): Api {
  const root = base.replace(/\/$/, "");

  async function send(path: string, init: FetchRequestInit, extra?: Record<string, string>) {
    const attempt = async (skipCache: boolean) => {
      const token = await getToken(skipCache ? { skipCache } : undefined);
      return fetch(`${root}${path}`, { ...init, headers: { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    };
    let res = await attempt(false);
    if (res.status === 401) res = await attempt(true);
    if (res.status === 401) {
      onSessionEnded?.();
      throw new ApiError(401, SESSION_ENDED);
    }
    return res;
  }

  async function request<T>(path: string, init: FetchRequestInit = {}): Promise<T> {
    const res = await send(path, init, init.body ? { "Content-Type": "application/json" } : undefined);
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

    listTrips: () => request("/trips"),
    getTrip: (id) => request(`/trips/${encodeURIComponent(id)}`),
    deleteTrip: (id) => request(`/trips/${encodeURIComponent(id)}`, { method: "DELETE" }),

    async generateTrip(draft: TripDraft, { onStep, signal, idempotencyKey }: GenerateOptions): Promise<Trip> {
      // expo/fetch exposes the response body as a stream on native, which React Native's global fetch does not.
      const res = await send("/trips/generate", { method: "POST", body: JSON.stringify(draft), signal }, {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      });
      if (!res.ok || !res.body) throw new GenerationError((await readError(res)).message);
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
