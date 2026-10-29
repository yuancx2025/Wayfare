import type { SavedPlaceReference } from "@/domain/types";

/** Structured encoding avoids collisions when opaque IDs contain separators. */
export const savedPlaceKey = ({ provider, kind, externalId }: SavedPlaceReference): string =>
  JSON.stringify([provider, kind, externalId]);
