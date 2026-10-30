import { useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, createContext, type ReactNode } from "react";
import type { Capabilities, Me, Preferences, ProfilePatch, Trip, TripDraft, TripSummary } from "@/domain/types";
import { DEFAULT_PREFS } from "@/domain/logic/labels";
import { api, ApiError } from "@/lib/api";
import { summarize } from "@/lib/api/local";

interface State {
  hydrated: boolean;
  loadError: string | null;
  summaries: TripSummary[];
  trips: Record<string, Trip>;
  defaultPrefs: Preferences;
  draft: TripDraft;
  draftNonce: number;
  me: Me | null;
  capabilities: Capabilities;
}

type Action =
  | { type: "hydrate"; summaries: TripSummary[]; defaultPrefs: Preferences; me: Me; capabilities: Capabilities }
  | { type: "loadFailed"; message: string }
  | { type: "startDraft"; destination?: string; destinationId?: string }
  | { type: "updateDraft"; patch: Partial<TripDraft> }
  | { type: "putTrip"; trip: Trip; isNew?: boolean }
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
    case "hydrate":
      return {
        ...state, hydrated: true, loadError: null, summaries: action.summaries, defaultPrefs: action.defaultPrefs,
        draft: emptyDraft(action.defaultPrefs), me: action.me, capabilities: action.capabilities,
      };
    case "loadFailed":
      return { ...state, hydrated: true, loadError: action.message };
    case "startDraft":
      return { ...state, draftNonce: state.draftNonce + 1, draft: emptyDraft(state.defaultPrefs, action.destination, action.destinationId) };
    case "updateDraft":
      return { ...state, draft: { ...state.draft, ...action.patch } };
    case "putTrip": {
      const summary = summarize(action.trip);
      const summaries = state.summaries.some((s) => s.id === summary.id)
        ? state.summaries.map((s) => (s.id === summary.id ? summary : s))
        : [summary, ...state.summaries];
      return {
        ...state, summaries, trips: { ...state.trips, [action.trip.id]: action.trip },
        draft: action.isNew ? emptyDraft(state.defaultPrefs) : state.draft,
      };
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
    loadError: null,
    summaries: [],
    trips: {},
    defaultPrefs: DEFAULT_PREFS,
    draft: emptyDraft(DEFAULT_PREFS),
    draftNonce: 0,
    me: null,
    capabilities: NO_CAPABILITIES,
  });
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef(new Map<string, Promise<Trip>>());

  const refresh = useCallback(async () => {
    try {
      const [summaries, defaultPrefs, me, capabilities] = await Promise.all([
        api.listTrips(), api.getPreferences(), api.getMe(), api.capabilities().catch(() => NO_CAPABILITIES),
      ]);
      dispatch({ type: "hydrate", summaries, defaultPrefs, me, capabilities });
    } catch (e) {
      dispatch({ type: "loadFailed", message: errorMessage(e) });
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
    const p = api.getTrip(id)
      .then((trip) => { dispatch({ type: "putTrip", trip }); return trip; })
      .finally(() => pending.current.delete(id));
    pending.current.set(id, p);
    return p;
  }, []);

  const value = useMemo<Store>(() => ({
    ...state,
    toast,
    showToast,
    refresh,
    loadTrip,
    startDraft: (destination, destinationId) => dispatch({ type: "startDraft", destination, destinationId }),
    updateDraft: (patch) => dispatch({ type: "updateDraft", patch }),
    putTrip: (trip, opts) => { dispatch({ type: "putTrip", trip, isNew: opts?.isNew }); refreshMe(); },
    deleteTrip: async (id) => {
      await api.deleteTrip(id);
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
        dispatch({ type: "putTrip", trip });
        refreshMe();
      }
      : undefined,
    loadHistoryFixtures: api.loadHistoryFixtures
      ? async () => {
        const trips = await api.loadHistoryFixtures!();
        for (const trip of trips) dispatch({ type: "putTrip", trip });
        refreshMe();
      }
      : undefined,
  }), [state, toast, showToast, refresh, loadTrip, refreshMe]);

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
