import type { DestinationCard, SavedPlaceDetails, SavedPlaceReference } from "@/domain/types";
import { DESTINATIONS } from "@/domain/data/places";

/** Structured encoding avoids collisions when opaque IDs contain separators. */
export const savedPlaceKey = ({ provider, kind, externalId }: SavedPlaceReference): string =>
  JSON.stringify([provider, kind, externalId]);

/** The bundled registry establishes catalog provenance; remaining placeId values are provider IDs. */
export function destinationSaveReference(destination: DestinationCard): SavedPlaceReference | null {
  if (DESTINATIONS.some((item) => item.id === destination.id)) return { provider: "catalog", kind: "destination", externalId: destination.id };
  return destination.placeId ? { provider: "google", kind: "destination", externalId: destination.placeId } : null;
}

/** Reuse catalog data in either adapter without sending catalog IDs to the active Google provider. */
export function catalogSavedPlaceDetails(reference: SavedPlaceReference): SavedPlaceDetails | null {
  if (reference.provider !== "catalog") return null;
  if (reference.kind === "destination") {
    const destination = DESTINATIONS.find((item) => item.id === reference.externalId);
    if (!destination) return null;
    return {
      reference, name: destination.name, subtitle: destination.country, description: destination.blurb,
      image: destination.image, destinationId: destination.id, bestFor: destination.bestFor,
      googleMapsUri: `https://www.google.com/maps/search/?api=1&query=${destination.center.lat},${destination.center.lng}`,
    };
  }
  const place = DESTINATIONS.flatMap((destination) => destination.places).find((item) => item.id === reference.externalId);
  if (!place) return null;
  return {
    reference, name: place.name, subtitle: place.area, description: place.description, rating: place.rating,
    googleMapsUri: `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`,
  };
}
