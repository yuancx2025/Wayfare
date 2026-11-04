# Saved-place integration contract

Implemented on `feature/collections-and-memories`, increments 3A and 3B, October 29, 2026.
The branch now integrates `main@7e23d1b`, including the merged authentication
and Nearby interfaces. It has not been deployed to a shared account database.
The November 3 integration status below supersedes earlier handoff snapshots.

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
| `getSavedPlaceDetails(id)` | `GET /me/saved-places/{id}/details` | Owned reference resolved into presentation; 404/502 on unavailable details |

Repeated saves, including simultaneous requests, return the existing ID and
creation time. Provider/kind/case differences remain distinct. The server obtains
the owner through the existing shared identity dependency, never the payload.
The local adapter uses `wayfare.guest.savedPlaces.v1`; authenticated accounts use the shared Clerk-backed remote adapter instead. Remote failures never fall back into guest
storage. Repositories sharing a local key serialize their operations in one
JavaScript runtime; this is not a cross-process transaction.

References persist independently of provider availability. Saving does not
validate existence through a provider call. A provider may later return 404/502,
or be unavailable in the current mode. The reference must remain listed and
removable. Deleting a trip leaves saved places intact; deleting an account
cascades its remote references.

## Current UI and integration examples

`SavePlaceButton` is shared by Explore, destination details, activity details and
Saved. It reads one TanStack Query collection and waits for confirmed persistence.
Matching controls disable during a write; repeated matching requests share a
promise. Reads started before or during a write are cancelled before merging
confirmed state. Independent writes merge into the collection. A 404 removing an
already known entry is treated as the desired absent state, while other failures
retain the entry. List/read failures are distinct from empty collections.

Activity details expose provenance directly:

```ts
await api.savePlace({
  provider: details.source,
  kind: "place",
  externalId: details.placeId,
});
```

The merged Nearby contract exposes `source` on its result envelope:

```ts
await api.savePlace({
  provider: nearbyResults.source,
  kind: "place",
  externalId: nearbyItem.place.id,
});
```

The shared component can be connected by the Nearby owner:

```tsx
<SavePlaceButton
  reference={{ provider: nearbyResults.source, kind: "place", externalId: nearbyItem.place.id }}
  name={nearbyItem.place.name}
/>
```

The Nearby screen is not connected to Save yet. Its owner must first complete
the shared API integration; its existing implementation is preserved in this branch. Destination saving needs explicit
catalog provenance or a resolved Google `placeId`; presence of a `placeId` alone
does not prove Google provenance because the local catalog adapter also sets it.

## Detail resolution

`SavedPlaceDetails` is transient presentation: the exact reference, name, subtitle,
description and optional image, rating, links, opening hours, destination ID and
interests. It contains no itinerary time or activity fields and is never copied
into the saved-reference table or AsyncStorage collection.

The client resolves bundled catalog data in either mode. The backend checks
ownership before resolving details and calls Discovery through its public
services. Catalog IDs use exact registry lookups even when Google is active;
planner name aliases are not reference IDs. Google place details reuse the
existing provider cache, and Google destination resolution returns the cached
internal destination ID for planning while retaining the external Place ID in
the reference. Provider errors do not remove or change a saved record.

Saved list and detail screens expose unavailable/retry/remove states. Successful
removal from detail returns to Saved; opening a saved place does not manufacture
an itinerary activity. Unknown destination provenance leaves browsing/planning
available and omits the save action.

## Remaining work and handoffs

- Review the local `Wayfare-Collections.fig` artifact and complete Figma import
  verification. Its 12 Saved Places frames and the original Favorite Trips pages
  remain outside the repository. A cloud upload needs explicit authorization.
- Complete precise design comparison and Android native acceptance. Four icon
  tabs are retained; trip favorites remain under Profile.
- Collection list, detail and mutation keys now include `guest` or the Clerk
  account ID, and consumers use `useApi()`. Tests cover separate account caches,
  late writes, and favorite responses after a Store remount. Full session lifecycle
  acceptance remains pending the authentication owner's root-provider integration.
- Upgrades 001/002 have been checked against the Clerk-enabled model in a disposable
  database. They retain internal `users.id` ownership. They do not add missing
  Clerk fields to a pre-auth database; no shared database was changed.
- Backend collection tests now use signed JWTs through the real verifier. Missing
  sessions and forged identity headers are rejected; foreign records return 404.
  Test-key verification is not live Clerk acceptance.
- Upstream follow-ups remain outside this branch: the undefined root `queryClient`
  and duplicate provider/navigation trees, the retired API singleton import in
  Nearby, and missing `nearbyPlaces` in the no-backend account adapter. Do not
  treat the passing collection suites as full application startup acceptance.
- Finish Android/native acceptance and live provider checks before release.

Increment 3B adds the screens and shared action. No journal/photo work or live Google acceptance is claimed by these increments.
