import { useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, createContext, type ReactNode } from "react";
import type { Capabilities, Me, Preferences, ProfilePatch, Trip, TripDraft, TripMetadataResult, TripSummary } from "@/domain/types";
import { DEFAULT_PREFS } from "@/domain/logic/labels";
import { api, ApiError } from "@/lib/api";
import { summarize } from "@/lib/api/local";

interface State {
  hydrated: boolean;
  refreshing: boolean;
  loadError: string | null;
  summaries: TripSummary[];
  trips: Record<string, Trip>;
  defaultPrefs: Preferences;
  draft: TripDraft;
  draftNonce: number;
  me: Me | null;
  capabilities: Capabilities;
  favoritePending: Record<string, boolean>;
}

type Action =
  | { type: "hydrate"; summaries: TripSummary[]; defaultPrefs: Preferences; me: Me; capabilities: Capabilities; preserveMetadataIds: Set<string> }
  | { type: "refreshStarted" }
  | { type: "loadFailed"; message: string }
  | { type: "startDraft"; destination?: string; destinationId?: string }
  | { type: "updateDraft"; patch: Partial<TripDraft> }
  | { type: "putTrip"; trip: Trip; isNew?: boolean; preserveMetadata?: boolean }
  | { type: "tripMetadata"; metadata: TripMetadataResult }
  | { type: "favoritePending"; id: string; pending: boolean }
  | { type: "deleteTrip"; id: string }
  | { type: "saveDefaultPrefs"; prefs: Preferences }
  | { type: "setMe"; me: Me };

const NO_CAPABILITIES: Capabilities = { google: false, llm: false, agent: false };

const emptyDraft = (prefs: Preferences, destination = "", destinationId?: string): TripDraft => ({
  destination,
  destinationId,
  startDate: "",
  endDate: "",
  travelers: 2,
  prefs: { ...prefs, interests: [...prefs.interests], food: [...prefs.food] },
  simulateFailure: false,
});

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "refreshStarted":
      return { ...state, refreshing: true };
    case "hydrate": {
      const summaries = action.summaries.map((summary) => {
        const current = state.summaries.find((trip) => trip.id === summary.id) ?? state.trips[summary.id];
        return current && action.preserveMetadataIds.has(summary.id)
          ? { ...summary, isFavorite: current.isFavorite, visited: current.visited } : summary;
      });
      const trips = { ...state.trips };
      for (const summary of summaries) {
        if (trips[summary.id]) trips[summary.id] = { ...trips[summary.id], isFavorite: summary.isFavorite, visited: summary.visited };
      }
      return {
        ...state, hydrated: true, refreshing: false, loadError: null, summaries, trips, defaultPrefs: action.defaultPrefs,
        draft: emptyDraft(action.defaultPrefs), me: action.me, capabilities: action.capabilities,
      };
    }
    case "loadFailed":
      return { ...state, hydrated: true, refreshing: false, loadError: action.message };
    case "startDraft":
      return { ...state, draftNonce: state.draftNonce + 1, draft: emptyDraft(state.defaultPrefs, action.destination, action.destinationId) };
    case "updateDraft":
      return { ...state, draft: { ...state.draft, ...action.patch } };
    case "putTrip": {
      const current = state.trips[action.trip.id];
      const base = current && (current.version ?? 1) > (action.trip.version ?? 1) ? current : action.trip;
      const metadata = state.summaries.find((trip) => trip.id === base.id) ?? current;
      const trip = action.preserveMetadata && metadata
        ? { ...base, isFavorite: metadata.isFavorite, visited: metadata.visited } : base;
      const summary = summarize(trip);
      const summaries = state.summaries.some((s) => s.id === summary.id)
        ? state.summaries.map((s) => (s.id === summary.id ? summary : s))
        : [summary, ...state.summaries];
      return {
        ...state, summaries, trips: { ...state.trips, [trip.id]: trip },
        draft: action.isNew ? emptyDraft(state.defaultPrefs) : state.draft,
      };
    }
    case "tripMetadata": {
      const { id, isFavorite, visited } = action.metadata;
      return {
        ...state,
        summaries: state.summaries.map((trip) => trip.id === id ? { ...trip, isFavorite, visited } : trip),
        trips: state.trips[id] ? { ...state.trips, [id]: { ...state.trips[id], isFavorite, visited } } : state.trips,
      };
    }
    case "favoritePending": {
      const favoritePending = { ...state.favoritePending };
      if (action.pending) favoritePending[action.id] = true;
      else delete favoritePending[action.id];
      return { ...state, favoritePending };
    }
    case "deleteTrip": {
      const { [action.id]: _gone, ...trips } = state.trips;
      return { ...state, trips, summaries: state.summaries.filter((s) => s.id !== action.id) };
    }
    case "saveDefaultPrefs":
      return { ...state, defaultPrefs: action.prefs };
    case "setMe":
      return { ...state, me: action.me };
  }
}

interface Store extends State {
  startDraft: (destination?: string, destinationId?: string) => void;
  updateDraft: (patch: Partial<TripDraft>) => void;
  /** Stores a trip returned by the API (newly generated or adjusted). */
  putTrip: (trip: Trip, opts?: { isNew?: boolean }) => void;
  deleteTrip: (id: string) => Promise<void>;
  saveDefaultPrefs: (prefs: Preferences) => Promise<void>;
  saveProfile: (patch: ProfilePatch) => Promise<void>;
  setTripFavorite: (id: string, isFavorite: boolean) => Promise<void>;
  /** Offline only; undefined when the backend is configured. */
  loadSample?: () => Promise<void>;
  /** Offline only: past, ongoing, and today-boundary trips for history. */
  loadHistoryFixtures?: () => Promise<void>;
  loadTrip: (id: string) => Promise<Trip>;
  refresh: () => Promise<void>;
  toast: string | null;
  showToast: (msg: string) => void;
}

const StoreContext = createContext<Store | null>(null);

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    hydrated: false,
    refreshing: false,
    loadError: null,
    summaries: [],
    trips: {},
    defaultPrefs: DEFAULT_PREFS,
    draft: emptyDraft(DEFAULT_PREFS),
    draftNonce: 0,
    me: null,
    capabilities: NO_CAPABILITIES,
    favoritePending: {},
  });
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef(new Map<string, Promise<Trip>>());
  const pendingFavorites = useRef(new Map<string, { value: boolean; promise: Promise<void> }>());
  const metadataEpoch = useRef(new Map<string, number>());
  const removedTrips = useRef(new Set<string>());
  const refreshEpoch = useRef(0);

  const refresh = useCallback(async () => {
    const mine = ++refreshEpoch.current;
    const epochs = new Map(metadataEpoch.current);
    const preserveMetadataIds = new Set(pendingFavorites.current.keys());
    dispatch({ type: "refreshStarted" });
    try {
      const [summaries, defaultPrefs, me, capabilities] = await Promise.all([
        api.listTrips(), api.getPreferences(), api.getMe(), api.capabilities().catch(() => NO_CAPABILITIES),
      ]);
      if (mine !== refreshEpoch.current) return;
      for (const [id, epoch] of metadataEpoch.current) {
        if (epochs.get(id) !== epoch) preserveMetadataIds.add(id);
      }
      dispatch({ type: "hydrate", summaries: summaries.filter((trip) => !removedTrips.current.has(trip.id)), defaultPrefs, me, capabilities, preserveMetadataIds });
    } catch (e) {
      if (mine === refreshEpoch.current) dispatch({ type: "loadFailed", message: errorMessage(e) });
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // A getMe started before the latest profile save must not overwrite that save.
  const meEpoch = useRef(0);
  const refreshMe = useCallback(() => {
    const seen = meEpoch.current;
    api.getMe().then((me) => {
      if (seen === meEpoch.current) dispatch({ type: "setMe", me });
    }).catch(() => undefined);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const loadTrip = useCallback((id: string) => {
    const inflight = pending.current.get(id);
    if (inflight) return inflight;
    const epoch = metadataEpoch.current.get(id);
    const wasPending = pendingFavorites.current.has(id);
    const p = api.getTrip(id)
      .then((trip) => {
        if (removedTrips.current.has(id)) throw new ApiError(404, "Trip not found");
        dispatch({ type: "putTrip", trip, preserveMetadata: wasPending || epoch !== metadataEpoch.current.get(id) });
        return trip;
      })
      .finally(() => pending.current.delete(id));
    pending.current.set(id, p);
    return p;
  }, []);

  const setTripFavorite = useCallback(function setFavorite(id: string, isFavorite: boolean): Promise<void> {
    const active = pendingFavorites.current.get(id);
    if (active) {
      return active.value === isFavorite ? active.promise : active.promise.catch(() => undefined).then(() => setFavorite(id, isFavorite));
    }
    if (removedTrips.current.has(id)) return Promise.reject(new ApiError(404, "Trip not found"));
    metadataEpoch.current.set(id, (metadataEpoch.current.get(id) ?? 0) + 1);
    dispatch({ type: "favoritePending", id, pending: true });
    const promise = api.updateTripMetadata(id, { isFavorite }).then((metadata) => {
      if (!removedTrips.current.has(id)) dispatch({ type: "tripMetadata", metadata });
    }).finally(() => {
      pendingFavorites.current.delete(id);
      dispatch({ type: "favoritePending", id, pending: false });
    });
    pendingFavorites.current.set(id, { value: isFavorite, promise });
    return promise;
  }, []);

  const value = useMemo<Store>(() => ({
    ...state,
    toast,
    showToast,
    refresh,
    loadTrip,
    setTripFavorite,
    startDraft: (destination, destinationId) => dispatch({ type: "startDraft", destination, destinationId }),
    updateDraft: (patch) => dispatch({ type: "updateDraft", patch }),
    putTrip: (trip, opts) => {
      if (opts?.isNew) removedTrips.current.delete(trip.id);
      if (removedTrips.current.has(trip.id)) return;
      dispatch({ type: "putTrip", trip, isNew: opts?.isNew, preserveMetadata: !opts?.isNew });
      refreshMe();
    },
    deleteTrip: async (id) => {
      await api.deleteTrip(id);
      removedTrips.current.add(id);
      dispatch({ type: "deleteTrip", id });
      refreshMe();
    },
    saveDefaultPrefs: async (prefs) => {
      const saved = await api.savePreferences(prefs);
      dispatch({ type: "saveDefaultPrefs", prefs: saved });
    },
    saveProfile: async (patch) => {
      const mine = ++meEpoch.current;
      const me = await api.updateProfile(patch);
      if (mine === meEpoch.current) dispatch({ type: "setMe", me });
    },
    loadSample: api.loadSample
      ? async () => {
        const trip = await api.loadSample!();
        removedTrips.current.delete(trip.id);
        dispatch({ type: "putTrip", trip });
        refreshMe();
      }
      : undefined,
    loadHistoryFixtures: api.loadHistoryFixtures
      ? async () => {
        const trips = await api.loadHistoryFixtures!();
        for (const trip of trips) {
          removedTrips.current.delete(trip.id);
          dispatch({ type: "putTrip", trip });
        }
        refreshMe();
      }
      : undefined,
  }), [state, toast, showToast, refresh, loadTrip, refreshMe, setTripFavorite]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const s = useContext(StoreContext);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}

/** Full trip from the cache, fetched on first use. */
export function useTrip(id: string | undefined): { trip?: Trip; loading: boolean; error?: string } {
  const { trips, loadTrip } = useStore();
  const trip = id ? trips[id] : undefined;
  const [error, setError] = useState<{ id: string; message: string } | null>(null);
  useEffect(() => {
    if (!id || trip) return;
    let alive = true;
    loadTrip(id).catch((e) => {
      if (alive) setError({ id, message: e instanceof ApiError && e.status === 404 ? "It may have been deleted." : errorMessage(e) });
    });
    return () => { alive = false; };
  }, [id, trip, loadTrip]);
  const err = !id ? "It may have been deleted." : error?.id === id ? error.message : undefined;
  return { trip, loading: !trip && !err, error: err };
}
