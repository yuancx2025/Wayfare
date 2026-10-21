import type {
  Capabilities, DayRoute, DestinationCard, Me, NearbyRequest, NearbyResults, Place, PlaceDetails, Preferences, Proposal, ProposalRequest, Suggestion, Trip,
  TripDraft, TripSummary,
} from "@/domain/types";

export interface GenerateOptions {
  onStep: (index: number) => void;
  signal?: AbortSignal;
  idempotencyKey?: string;
}

/** Everything the screens need from a backend. Implemented by the FastAPI client and by an offline fallback. */
export interface Api {
  mode: "remote" | "local";
  capabilities(): Promise<Capabilities>;
  getMe(): Promise<Me>;
  getPreferences(): Promise<Preferences>;
  savePreferences(prefs: Preferences): Promise<Preferences>;

  listTrips(): Promise<TripSummary[]>;
  getTrip(id: string): Promise<Trip>;
  deleteTrip(id: string): Promise<void>;
  generateTrip(draft: TripDraft, opts: GenerateOptions): Promise<Trip>;
  /** Offline only: adds the bundled New York sample trip. */
  loadSample?(): Promise<Trip>;

  autocomplete(q: string, sessionToken: string): Promise<Suggestion[]>;
  resolveDestination(placeId: string): Promise<DestinationCard>;
  listDestinations(q: string): Promise<DestinationCard[]>;
  placeDetails(placeId: string, visit?: { date: string; startMin: number; durationMin: number }): Promise<PlaceDetails | null>;
  dayRoute(tripId: string, day: number): Promise<DayRoute | null>;
  /** Places closest to a position, by straight-line distance. Coordinates are used for this request only. */
  nearbyPlaces(req: NearbyRequest): Promise<NearbyResults>;

  alternatives(tripId: string, day: number, activityId: string): Promise<Place[]>;
  propose(tripId: string, day: number, req: ProposalRequest): Promise<Proposal>;
  applyProposal(tripId: string, proposalId: string): Promise<Trip>;

  /** Resolves API-relative image paths (e.g. place photos proxied by the backend). */
  imageUrl(src: string): string;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
