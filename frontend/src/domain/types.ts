// Shared, typed trip model. Mirrors the future FastAPI/Pydantic schemas.

export type Pace = "relaxed" | "balanced" | "packed";
export type Interest = "food" | "culture" | "nature" | "museums" | "shopping" | "nightlife" | "architecture";
export type FoodPref = "local-classics" | "street-food" | "seafood" | "vegetarian" | "cafes" | "fine-dining";
export type Transport = "walking" | "transit" | "driving" | "mix";
export type Budget = "budget" | "moderate" | "premium";
export type Category = Interest;
export type LegMode = "walk" | "transit" | "drive";
export type Slot = "lunch" | "dinner" | "snack" | "evening";

export interface Preferences {
  pace: Pace;
  interests: Interest[];
  food: FoodPref[];
  transport: Transport;
  budget: Budget;
}

export interface OpenWindow {
  day: number; // 0 = Sunday
  openMin: number;
  closeMin: number;
}

export interface Place {
  id: string;
  name: string;
  category: Category;
  area: string;
  lat: number;
  lng: number;
  durationMin: number;
  description: string;
  food?: FoodPref[];
  price?: 1 | 2 | 3;
  rating?: number;
  hours?: OpenWindow[];
  why?: string; // set on replacement alternatives
}

export interface Destination {
  id: string;
  name: string;
  country: string;
  image: string;
  blurb: string;
  bestFor: Interest[];
  center: { lat: number; lng: number };
  places: Place[];
}

/** Destination as returned by the API (no place catalog attached). */
export type DestinationCard = Omit<Destination, "places"> & { placeId?: string };

export interface Leg {
  mode: LegMode;
  minutes: number;
  km: number;
  source?: "google" | "estimate"; // google = Routes API time, otherwise a distance-based estimate
}

export interface Activity {
  id: string; // stable: shared by itinerary card + map marker
  placeId: string;
  name: string;
  category: Category;
  area: string;
  lat: number;
  lng: number;
  startMin: number; // minutes from midnight
  durationMin: number;
  description: string;
  why: string;
  slot?: Slot;
  legIn?: Leg; // travel from the previous stop
}

export interface Day {
  index: number; // 0-based
  date: string; // YYYY-MM-DD
  theme: string;
  areas: string;
  startMin: number;
  bufferMin: number;
  walkCapMin?: number;
  activities: Activity[];
}

/** Collection metadata is independent of itinerary dates, contents, and version. */
export interface TripMetadata {
  isFavorite: boolean;
  visited: boolean;
}

export type TripMetadataPatch = Partial<TripMetadata>;
export interface TripMetadataResult extends TripMetadata {
  id: string;
}

export interface Trip extends TripMetadata {
  id: string;
  destinationId: string;
  destination: string;
  country: string;
  image: string;
  startDate: string;
  endDate: string;
  travelers: number;
  prefs: Preferences;
  days: Day[];
  adjusted: boolean;
  createdAt: number;
  version?: number;
}

export type TripPhase = "ongoing" | "upcoming" | "past";

export interface TripSummary extends TripMetadata {
  id: string;
  destinationId: string;
  destination: string;
  country: string;
  image: string;
  startDate: string;
  endDate: string;
  travelers: number;
  dayCount: number;
  stopCount: number;
  adjusted: boolean;
  createdAt: number;
}

export interface TripDraft {
  destination: string;
  destinationId?: string; // set once a suggestion is picked
  startDate: string;
  endDate: string;
  travelers: number;
  prefs: Preferences;
  simulateFailure: boolean; // offline preview only
}

export interface Suggestion {
  placeId: string;
  name: string;
  secondary: string;
  source: "catalog" | "google";
}

export interface Change { type: "added" | "removed" | "changed"; text: string }
export interface Proposal { proposalId?: string; day: Day; changes: Change[]; replacedId?: string; newId?: string }
export type AdjustKind = "relaxed" | "less-walking" | "more-food" | "replace" | "custom";
export interface ProposalRequest { kind: AdjustKind; activityId?: string; placeId?: string; instruction?: string }

export interface PlaceDetails {
  placeId: string;
  name: string;
  rating?: number;
  userRatingCount?: number;
  websiteUri?: string;
  googleMapsUri?: string;
  weekdayDescriptions?: string[];
  openDuringVisit?: boolean;
  source: "catalog" | "google";
}

/** Provider identity, independent of itinerary activities and destination cache IDs. */
export interface SavedPlaceReference {
  provider: "catalog" | "google";
  kind: "destination" | "place";
  externalId: string;
}

/** Presentation is resolved separately; provider responses are not permanent saved records. */
export interface SavedPlace extends SavedPlaceReference {
  id: string;
  createdAt: number;
}

/** Resolved presentation only; never written into a saved-reference record. */
export interface SavedPlaceDetails {
  reference: SavedPlaceReference;
  name: string;
  subtitle: string;
  description: string;
  image?: string;
  rating?: number;
  websiteUri?: string;
  googleMapsUri?: string;
  weekdayDescriptions?: string[];
  destinationId?: string;
  bestFor?: Interest[];
}

export interface Me {
  id: string;
  name: string;
  home: string;
  travelingSince?: number;
  initials: string;
  stats: { trips: number; daysPlanned: number; countries: number };
}

/** Fields accepted by `PATCH /me`. Omitted fields are left unchanged. */
export interface ProfilePatch {
  name?: string;
  home?: string;
}

export interface Capabilities { google: boolean; llm: boolean; agent: boolean }

export interface DayRoute {
  legs: { fromId: string; toId: string; mode: LegMode; polyline?: string }[];
  source: "google" | "estimate";
}
