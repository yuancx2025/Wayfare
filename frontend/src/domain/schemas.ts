import { z } from "zod";
import { daysBetween, todayISO } from "./lib/format";

const MAX_DAYS = 10;

export const profileSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(120, "Keep your name to 120 characters"),
  home: z.string().trim().max(120, "Keep your home to 120 characters"),
});

export type ProfileValues = z.infer<typeof profileSchema>;

export const preferencesSchema = z.object({
  pace: z.enum(["relaxed", "balanced", "packed"]),
  interests: z.array(z.enum(["food", "culture", "nature", "museums", "shopping", "nightlife", "architecture"])),
  food: z.array(z.enum(["local-classics", "street-food", "seafood", "vegetarian", "cafes", "fine-dining"])),
  transport: z.enum(["walking", "transit", "driving", "mix"]),
  budget: z.enum(["budget", "moderate", "premium"]),
});

export const createTripSchema = z.object({
  destination: z.string(),
  destinationId: z.string().optional(),
  startDate: z.string(),
  endDate: z.string(),
  travelers: z.number().int().min(1).max(12),
}).superRefine((draft, ctx) => {
  const destination = draft.destination.trim();
  if (!destination) {
    ctx.addIssue({ code: "custom", path: ["destination"], message: "Where are you going?" });
  } else if (!draft.destinationId) {
    ctx.addIssue({ code: "custom", path: ["destination"], message: "Pick a destination from the suggestions." });
  }
  if (!draft.startDate) {
    ctx.addIssue({ code: "custom", path: ["startDate"], message: "Pick a start date" });
  } else if (draft.startDate < todayISO()) {
    ctx.addIssue({ code: "custom", path: ["startDate"], message: "Start date is in the past" });
  }
  if (!draft.endDate) {
    ctx.addIssue({ code: "custom", path: ["endDate"], message: "Pick an end date" });
  } else if (draft.startDate && draft.endDate < draft.startDate) {
    ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date must be on or after the start" });
  } else if (draft.startDate && daysBetween(draft.startDate, draft.endDate) + 1 > MAX_DAYS) {
    ctx.addIssue({ code: "custom", path: ["endDate"], message: `Keep trips to ${MAX_DAYS} days or fewer` });
  }
});

const activitySchema = z.looseObject({
  id: z.string(),
  placeId: z.string(),
  name: z.string(),
  category: z.string(),
  area: z.string(),
  lat: z.number(),
  lng: z.number(),
  startMin: z.number(),
  durationMin: z.number(),
  description: z.string(),
  why: z.string(),
  legIn: z.looseObject({
    mode: z.enum(["walk", "transit", "drive"]),
    minutes: z.number(),
    km: z.number(),
    source: z.enum(["google", "estimate"]).optional(),
  }).optional(),
});

const daySchema = z.looseObject({
  index: z.number(),
  date: z.string(),
  theme: z.string(),
  areas: z.string(),
  startMin: z.number(),
  bufferMin: z.number(),
  activities: z.array(activitySchema),
});

export const tripMetadataSchema = z.object({
  isFavorite: z.boolean().default(false),
  visited: z.boolean().default(false),
});

/** Omitted fields are unchanged; every supplied field must be an explicit boolean. */
export const tripMetadataPatchSchema = z.strictObject({
  isFavorite: z.boolean().optional(),
  visited: z.boolean().optional(),
}).refine(
  (patch) => Object.keys(patch).length > 0 && Object.values(patch).every((value) => typeof value === "boolean"),
  "Provide at least one explicit metadata value",
);

export const tripMetadataResultSchema = z.object({
  id: z.string(),
  isFavorite: z.boolean(),
  visited: z.boolean(),
});

export const tripSchema = z.looseObject({
  id: z.string(),
  destinationId: z.string(),
  destination: z.string(),
  country: z.string(),
  image: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  travelers: z.number(),
  prefs: preferencesSchema,
  days: z.array(daySchema),
  adjusted: z.boolean(),
  createdAt: z.number(),
  version: z.number().optional(),
  ...tripMetadataSchema.shape,
});

export const tripListSchema = z.array(tripSchema);

const savedPlaceReferenceFields = {
  provider: z.enum(["catalog", "google"]),
  kind: z.enum(["destination", "place"]),
  // Keep opaque IDs byte-for-byte. Reject whitespace/control characters rather than trimming.
  externalId: z.string().min(1).regex(/^[^\x00-\x20\x7f]+$/, "Use the provider's external identifier"),
};

export const savedPlaceReferenceSchema = z.strictObject(savedPlaceReferenceFields);
export const savedPlaceSchema = z.looseObject({
  ...savedPlaceReferenceFields,
  id: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
});
export const savedPlaceListSchema = z.array(savedPlaceSchema);
export const savedPlaceDetailsSchema = z.object({
  reference: savedPlaceReferenceSchema,
  name: z.string().min(1),
  subtitle: z.string(),
  description: z.string(),
  image: z.string().optional(),
  rating: z.number().optional(),
  websiteUri: z.string().optional(),
  googleMapsUri: z.string().optional(),
  weekdayDescriptions: z.array(z.string()).optional(),
  destinationId: z.string().optional(),
  bestFor: preferencesSchema.shape.interests.optional(),
});

export type CreateTripValues = z.infer<typeof createTripSchema>;
