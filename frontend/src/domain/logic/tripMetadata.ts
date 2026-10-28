import { tripMetadataSchema } from "../schemas";
import type { TripMetadata } from "../types";

/** Older records and servers omit collection fields; never infer visits from dates. */
export function withTripMetadata<T extends Partial<TripMetadata>>(trip: T): T & TripMetadata {
  return { ...trip, ...tripMetadataSchema.parse(trip) };
}
