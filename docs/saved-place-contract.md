# Saved-place integration contract

Implemented on `feature/collections-and-memories`, increment 3A, October 29, 2026.
This is the branch's proposed integration boundary. It has not been merged into
the authentication or Nearby branches or deployed to a shared account database.

## Reference and stored record

```ts
interface SavedPlaceReference {
  provider: "catalog" | "google";
  kind: "destination" | "place";
  externalId: string;
}

interface SavedPlace extends SavedPlaceReference {
  id: string;
  createdAt: number; // Unix milliseconds
}
```

Identity is the current owner/scope plus the exact provider, kind and external ID.
Do not lowercase, trim, truncate or guess a provider from an ID prefix. Empty IDs
and ASCII whitespace/control characters are rejected. IDs are otherwise opaque.
Unknown request fields, including client-supplied owners and copied provider
responses, are rejected. Entry IDs are distinct from provider IDs.

Google destination references use `destination.placeId`, which is different from
the synthetic cached `destination.id`. Catalog destinations use their catalog ID.
Catalog and Google places use their provider's place ID, never `Activity.id`.
The caller must know the item's provenance; if provenance or the external ID is
missing, resolve it before enabling Save rather than manufacturing a reference.

Google documents variable-length IDs with no maximum length in its
[Place ID guide](https://developers.google.com/maps/documentation/places/web-service/place-id).
The backend retains the complete external ID in a text column. A SHA-256 digest
keeps the unique index bounded; a deduplication hit also compares the complete ID
and returns 409 on a mismatch, never silently aliasing another reference.

## Adapter and HTTP behavior

| Adapter | HTTP | Result |
| --- | --- | --- |
| `listSavedPlaces()` | `GET /me/saved-places` | Saved references, newest first |
| `savePlace(reference)` | `POST /me/saved-places` | 200, existing or newly saved entry |
| `removeSavedPlace(id)` | `DELETE /me/saved-places/{id}` | 204 after removal; 404 for missing/foreign entries |

Repeated saves, including simultaneous requests, return the existing ID and
creation time. Provider/kind/case differences remain distinct. The server obtains
the owner through the existing shared identity dependency, never the payload.
The local adapter uses `wayfare.guest.savedPlaces.v1`; it is not yet connected to
authenticated account namespaces. Remote failures never fall back into guest
storage. Repositories sharing a local key serialize their operations in one
JavaScript runtime; this is not a cross-process transaction.

References persist independently of provider availability. Saving does not
validate existence through a provider call. A provider may later return 404/502,
or be unavailable in the current mode. The reference must remain listed and
removable. Deleting a trip leaves saved places intact; deleting an account
cascades its remote references.

## Integration examples for the next UI slice

Activity details expose provenance directly:

```ts
await api.savePlace({
  provider: details.source,
  kind: "place",
  externalId: details.placeId,
});
```

The inspected Nearby branch (`7fe32b1`) exposes `source` on its result envelope:

```ts
await api.savePlace({
  provider: nearbyResults.source,
  kind: "place",
  externalId: nearbyItem.place.id,
});
```

This example does not imply that the Nearby save button is connected. Recheck
the owner's final types before integration. Destination saving needs explicit
catalog provenance or a resolved Google `placeId`; presence of a `placeId` alone
does not prove Google provenance because the local catalog adapter also sets it.

## Remaining work and handoffs

- Complete Figma Saved Places states before implementing the UI. Keep the four
  icon tabs and put trip favorites under Profile.
- Add a shared save action and Store/query lifecycle protection for delayed reads,
  pending mutations, removal and eventual account switching.
- Resolve catalog references from the bundled catalog and Google references
  through existing provider detail/cache behavior. Do not send a catalog ID to
  Google because the configured provider changed. Do not fabricate an Activity
  merely to open a saved place.
- Keep unavailable entries visible with a retry/remove state; no save operation
  should depend on details being available at that moment.
- Review SQL upgrade 002 against the auth owner's actual account baseline before
  applying it to a shared database. Startup never applies upgrade scripts.
- Connect verified identity and account/guest reset/scoping through the auth
  owner's final boundary. Current `X-User-Id` tests check predicates only; they
  do not establish authenticated privacy.
- Finish Android/native acceptance and live provider checks before release.

No journal, photo, new screen or live Google request is part of increment 3A.
