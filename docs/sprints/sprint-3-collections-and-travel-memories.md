# Sprint 3 — Collections and Travel Memories

[Overall roadmap](../wayfare-v2-roadmap.md) · [Previous: Authentication](sprint-2-authentication-and-private-accounts.md) · [Next: Location and Discovery](sprint-4-geolocation-and-nearby-discovery.md)

**Dates:** November 2–8, 2026.

**Priority:** P0 for the bounded feature set below.

**Goal:** Add useful personal collections and a deliberately small journal feature, including native image selection.

This is a planning document. Depends on Sprint 2's verified ownership, account-aware adapters, and V2 database baseline. Shared capacity and delivery rules are defined in the overall roadmap.

## Committed implementation

### Favorites and saved places — Frontend and Backend owners

- Add favorite controls to trip cards/details and a Favorite Trips screen under Profile.
- Add Save Place controls to destination and activity details.
- Add a Saved Places screen with open/details and remove actions.
- Persist favorites on owned trips.
- Deduplicate saved entries by owner, provider, item kind, and external identifier, distinguishing destinations from individual places.
- Reuse existing provider-detail/cache behavior rather than treating short-lived provider responses as permanent records.

### Visited status and journal — Backend owner

- Add an explicit `visited` flag independent of date classification.
- Add one plain-text journal entry per trip, limited to 5,000 characters.
- Make journals available for past trips and explicitly visited trips.
- Permit editing and deletion; preserve text when a save fails.
- Delete journal records when the owning trip is deleted. Saved-place entries remain independent of trip deletion.

### Public interface additions

| Interface | Purpose |
| --- | --- |
| `PATCH /trips/{id}` | Update only `isFavorite` and `visited` metadata |
| `GET /me/saved-places` | List the current user's saved items |
| `POST /me/saved-places` | Save an item; repeated saves return the existing entry |
| `DELETE /me/saved-places/{id}` | Remove an owned saved item |
| `GET/PUT/DELETE /trips/{id}/journal` | Read, save, or remove an owned trip's journal |

Add favorite/visited values to trip responses and summaries. Metadata changes must not increment the itinerary version or invalidate otherwise valid adjustment proposals.

### Local storage and photos — Integration/QA owner

- Implement equivalent guest collections, visited state, and journal text.
- Upgrade existing local records with safe defaults without dropping valid trips.
- Support **one journal photo per trip** using the native image picker.
- Copy selected images into persistent app document storage; store the association under the active account/guest namespace.
- Label images "On this device." Keep file paths out of cloud journal payloads.
- Support replace/remove, picker cancellation, missing files, and cleanup when a trip is deleted.

Use the system gallery picker and persistent file storage. See [Expo ImagePicker](https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/) and [Expo FileSystem](https://docs.expo.dev/versions/v57.0.0/sdk/filesystem/).

## Weekly execution

| Period | Work |
| --- | --- |
| Early week | Complete metadata, collection, and journal APIs while building screen shells. |
| Midweek | Connect both adapters; implement photo selection and file persistence. |
| End of week | Exercise account isolation, deletion behavior, and gallery demonstrations on both simulators. |

## Acceptance and handoff

- [ ] Repeated saves do not create duplicate saved places.
- [ ] Favorites and journal text survive restart; cloud text appears on another installation.
- [ ] Another account cannot access collections or journals.
- [ ] Past-dated trips are not automatically counted as visited.
- [ ] Photo selection survives restart on the same simulator; another installation does not imply cloud photo availability.
- [ ] Cancelling photo selection preserves the existing journal and image.
- [ ] Deleting a trip removes its journal and local photo association.

**Deliverable:** Favorites, saved places, confirmed visits, journal text, and persistent device-local journal images.

**Deferred:** Cloud image uploads, multiple photos, rich-text journals, and itinerary cloning.
