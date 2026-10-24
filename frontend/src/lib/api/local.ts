import type { Api } from "./types";
import { ApiError } from "./types";
import type { DestinationCard, Destination, Me, ProfilePatch, Proposal, Trip, TripDraft, TripSummary } from "@/domain/types";
import { loadJSON, saveJSON, saveJSONStrict } from "@/lib/storage";
import { DESTINATIONS, findDestination, getDestination } from "@/domain/data/places";
import { buildTrip, GenerationError } from "@/domain/logic/generate";
import { proposeAdjustment, proposeReplacement, replacementCandidates } from "@/domain/logic/adjust";
import { DEFAULT_PREFS } from "@/domain/logic/labels";
import { initials } from "@/domain/logic/profile";
import { addDays, todayISO } from "@/domain/lib/format";
import { preferencesSchema, profileSchema, tripListSchema } from "@/domain/schemas";

const KEYS = { trips: "wayfare.trips.v2", prefs: "wayfare.defaultPrefs.v1", profile: "wayfare.profile.v1" };
const DEFAULT_PROFILE = { name: "Alex Rivera", home: "Brooklyn, NY" };
const STEP_MS = 850;
const STEPS = 5;

const FIXTURE_PREFS: TripDraft["prefs"] = {
  ...DEFAULT_PREFS,
  interests: [...DEFAULT_PREFS.interests],
  food: [...DEFAULT_PREFS.food],
};

/** Past, ongoing, and today-boundary trips. Built directly so a past start date never goes through `createTripSchema`. */
export function historyFixtureTrips(today = todayISO()): Trip[] {
  const specs: { id: string; destinationId: string; start: number; end: number }[] = [
    { id: "trip-history-past", destinationId: "chicago", start: -12, end: -8 },
    { id: "trip-history-ends-today", destinationId: "seattle", start: -2, end: 0 },
    { id: "trip-history-starts-today", destinationId: "nyc", start: 0, end: 2 },
    { id: "trip-history-ongoing", destinationId: "san-francisco", start: -1, end: 3 },
    { id: "trip-history-tomorrow", destinationId: "new-orleans", start: 1, end: 3 },
  ];
  return specs.map(({ id, destinationId, start, end }) => {
    const destination = getDestination(destinationId);
    return buildTrip(id, destination, {
      destination: destination.name,
      destinationId,
      startDate: addDays(today, start),
      endDate: addDays(today, end),
      travelers: 2,
      simulateFailure: false,
      prefs: FIXTURE_PREFS,
    });
  });
}

export function sampleTrip(): Trip {
  const start = addDays(todayISO(), 24);
  return buildTrip("trip-nyc-seed", getDestination("nyc"), {
    destination: "New York City",
    startDate: start,
    endDate: addDays(start, 4),
    travelers: 2,
    simulateFailure: false,
    prefs: {
      pace: "balanced",
      interests: ["food", "culture", "museums", "nature"],
      food: ["street-food", "local-classics"],
      transport: "transit",
      budget: "moderate",
    },
  });
}

const card = ({ places: _places, ...rest }: Destination): DestinationCard => ({ ...rest, placeId: rest.id });

export function summarize(t: Trip): TripSummary {
  return {
    id: t.id, destinationId: t.destinationId, destination: t.destination, country: t.country, image: t.image,
    startDate: t.startDate, endDate: t.endDate, travelers: t.travelers, adjusted: t.adjusted, createdAt: t.createdAt,
    dayCount: t.days.length, stopCount: t.days.reduce((s, d) => s + d.activities.length, 0),
  };
}

const abortError = () => Object.assign(new Error("Aborted"), { name: "AbortError" });

const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) return reject(abortError());
  const id = setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => { clearTimeout(id); reject(abortError()); }, { once: true });
});

type StoredProfile = { name: string; home: string };

/** Offline stand-in for the FastAPI backend: same contract, backed by AsyncStorage and the bundled catalog. */
export function createLocalApi(): Api {
  let trips: Trip[] | null = null;
  let profile: StoredProfile | null = null;
  const proposals = new Map<string, { tripId: string; proposal: Proposal }>();

  async function all(): Promise<Trip[]> {
    if (!trips) {
      // Stored data that doesn't match the trip model is dropped instead of crashing the home screen.
      const parsed = tripListSchema.safeParse(await loadJSON<unknown>(KEYS.trips));
      trips = parsed.success ? (parsed.data as Trip[]) : [];
    }
    return trips;
  }
  async function save(next: Trip[]) {
    trips = next;
    await saveJSON(KEYS.trips, next);
  }
  async function currentProfile(): Promise<StoredProfile> {
    if (profile) return profile;
    const parsed = profileSchema.safeParse(await loadJSON<unknown>(KEYS.profile));
    profile = parsed.success ? parsed.data : { ...DEFAULT_PROFILE };
    return profile;
  }
  function toMe(stored: StoredProfile, list: Trip[]): Me {
    return {
      id: "demo-user",
      name: stored.name,
      home: stored.home,
      travelingSince: 2019,
      initials: initials(stored.name),
      stats: {
        trips: list.length,
        daysPlanned: list.reduce((sum, trip) => sum + trip.days.length, 0),
        countries: new Set(list.map((trip) => trip.country)).size,
      },
    };
  }
  async function find(id: string): Promise<Trip> {
    const trip = (await all()).find((t) => t.id === id);
    if (!trip) throw new ApiError(404, "Trip not found");
    return trip;
  }
  const destinationFor = (draft: TripDraft) =>
    (draft.destinationId && DESTINATIONS.find((d) => d.id === draft.destinationId)) || findDestination(draft.destination);

  return {
    mode: "local",
    capabilities: async () => ({ google: false, llm: false, agent: false }),

    async getMe(): Promise<Me> {
      return toMe(await currentProfile(), await all());
    },
    async updateProfile(patch: ProfilePatch): Promise<Me> {
      const next = profileSchema.parse({ ...(await currentProfile()), ...patch });
      await saveJSONStrict(KEYS.profile, next);
      profile = next;
      return toMe(profile, await all());
    },
    async getPreferences() {
      const parsed = preferencesSchema.safeParse(await loadJSON<unknown>(KEYS.prefs));
      return parsed.success ? parsed.data : DEFAULT_PREFS;
    },
    async savePreferences(prefs) {
      await saveJSONStrict(KEYS.prefs, prefs);
      return prefs;
    },

    listTrips: async () => (await all()).map(summarize),
    getTrip: find,
    async deleteTrip(id) {
      await save((await all()).filter((t) => t.id !== id));
    },

    async generateTrip(draft, { onStep, signal }) {
      const dest = destinationFor(draft);
      if (!dest) throw new GenerationError("That destination isn't available in this preview.");
      for (let i = 0; i < STEPS; i++) {
        onStep(i);
        await wait(STEP_MS, signal);
      }
      if (draft.simulateFailure) throw new GenerationError("The planner timed out while checking opening hours.");
      const trip = buildTrip(`trip-${dest.id}-${Date.now().toString(36)}`, dest, draft);
      await save([trip, ...(await all())]);
      return trip;
    },
    async loadSample() {
      const list = await all();
      const existing = list.find((t) => t.id === "trip-nyc-seed");
      if (existing) return existing;
      const sample = sampleTrip();
      await save([sample, ...list]);
      return sample;
    },
    async loadHistoryFixtures() {
      const list = await all();
      const fixtures = historyFixtureTrips();
      const ids = new Set(fixtures.map((trip) => trip.id));
      await save([...fixtures, ...list.filter((trip) => !ids.has(trip.id))]);
      return fixtures;
    },

    async autocomplete(q) {
      const query = q.trim().toLowerCase();
      if (!query) return [];
      return DESTINATIONS
        .filter((d) => d.name.toLowerCase().includes(query) || d.country.toLowerCase().includes(query))
        .map((d) => ({ placeId: d.id, name: d.name, secondary: d.country, source: "catalog" as const }));
    },
    async resolveDestination(placeId) {
      const dest = DESTINATIONS.find((d) => d.id === placeId);
      if (!dest) throw new ApiError(404, "Destination not found");
      return card(dest);
    },
    async listDestinations(q) {
      const query = q.trim().toLowerCase();
      return DESTINATIONS
        .filter((d) => !query || `${d.name} ${d.country} ${d.bestFor.join(" ")}`.toLowerCase().includes(query))
        .map(card);
    },
    async placeDetails(placeId) {
      const place = DESTINATIONS.flatMap((d) => d.places.map((pl) => ({ pl, d }))).find((x) => x.pl.id === placeId);
      if (!place) return null;
      const query = encodeURIComponent(`${place.pl.name}, ${place.d.name}`);
      return {
        placeId, name: place.pl.name, rating: place.pl.rating, source: "catalog",
        googleMapsUri: `https://www.google.com/maps/search/?api=1&query=${query}`,
      };
    },
    dayRoute: async () => null,

    async alternatives(tripId, day, activityId) {
      return replacementCandidates(await find(tripId), day, activityId);
    },
    async propose(tripId, day, req) {
      const trip = await find(tripId);
      if (!trip.days[day]) throw new ApiError(404, "Day not found");
      let proposal: Proposal;
      if (req.kind === "replace") {
        const place = getDestination(trip.destinationId).places.find((pl) => pl.id === req.placeId);
        if (!req.activityId || !place) throw new ApiError(422, "Pick a stop and an alternative");
        proposal = proposeReplacement(trip, day, req.activityId, place);
      } else if (req.kind === "custom") {
        throw new ApiError(501, "Describing a change needs the planner backend.");
      } else {
        proposal = proposeAdjustment(trip, day, req.kind);
      }
      const proposalId = `prop-${Date.now().toString(36)}-${proposals.size}`;
      proposals.set(proposalId, { tripId, proposal });
      return { ...proposal, proposalId };
    },
    async applyProposal(tripId, proposalId) {
      const entry = proposals.get(proposalId);
      if (!entry || entry.tripId !== tripId) throw new ApiError(410, "This preview expired. Please try again.");
      proposals.delete(proposalId);
      const { day } = entry.proposal;
      let updated: Trip | undefined;
      await save((await all()).map((t) => {
        if (t.id !== tripId) return t;
        updated = { ...t, adjusted: true, version: (t.version ?? 1) + 1, days: t.days.map((d) => (d.index === day.index ? day : d)) };
        return updated;
      }));
      if (!updated) throw new ApiError(404, "Trip not found");
      return updated;
    },

    imageUrl: (src) => src,
  };
}
