# Collections and travel memories: incremental execution

Prepared on October 28, 2026, against `main@48d627b`.
Working branch: `feature/collections-and-memories`.

Build one reviewable slice at a time. Commit and push completed increments, and open a pull request after the agreed feature scope is complete. Application code, tests, and implementation documentation are written in English. Keep earlier chat analysis and temporary design files outside the repository.

## 1. Current ownership and branch boundaries

- Authentication is being implemented on `origin/authentication-with-clerk` (inspected at `371c758`). Do not duplicate it, merge it implicitly, or restore our retired authentication transport work into this branch.
- Nearby discovery is being implemented on `origin/ziqi/sprint-4-location-nearby` (inspected at `7fe32b1`). Provide reusable save actions for its owner to connect.
- This branch starts from main and owns trip favorites, saved places, explicit visited status, journals, and device-local journal photos.
- The original Sprint 3 scope is in `sprint-3-collections-and-travel-memories.md`. A dated past trip must never automatically count as visited.

Observed authentication handoff gaps are dependencies, not work to silently take over: the inspected branch exposes `useAuthSession()` with `mode`, Clerk `userId`, and `continueAsGuest`; its business API entry point is still a singleton and its `UserIdDep` still uses X-User-Id. A verifier module exists, but those business paths are not yet connected to it. Recheck this snapshot before integration rather than assuming the branch is finished.

Rechecked after fetching on October 28: `origin/main` remains at `48d627b` and `origin/authentication-with-clerk` at `371c758`. Neither inspected trip model contains collection metadata yet. The frontend contract below is this branch's proposed integration contract, not evidence of an agreed or deployed account database baseline. No authentication code or shared database was changed in increment 1.

## 2. Existing components and constraints

| Existing area | Reuse | Constraint to address |
| --- | --- | --- |
| Profile Stack and history rows | Navigation, list styling, loading/error/empty states | Add separate favorites and saved-place entries without disrupting account controls |
| TripCard and trip overview | Favorite control and visited/journal entry points | Keep nested button presses separate from card navigation |
| `Api` and Local/Remote adapters | One contract for both storage modes | Add methods in small slices; keep authentication inside the owner's shared API boundary |
| Store trip/detail summaries | Keep all views synchronized after metadata changes | Merge metadata only; an old full-trip response must not replace a newer itinerary |
| `tripHistory.ts` and `useToday` | Past/ongoing/upcoming classification | Confirm a consistent date/time-zone rule for journal eligibility |
| TripService / TripDep | Owned-trip lookup and current version semantics | Metadata updates must not increment itinerary version or invalidate proposals |
| DestinationService / PlaceService | Resolve saved references and reload details | Saved places are not Activities; do not fabricate times or itinerary fields |
| Existing PostgreSQL and provider fixtures | Ownership, uniqueness, failure, and transaction tests | Do not replace PostgreSQL constraint tests with SQLite or in-memory mocks |

Two local-storage issues must be covered when introducing new fields: entire-list schema validation can reject old records, and some existing save helpers swallow write failures. Use backward-compatible defaults, preserve valid records, and publish successful state only after a strict write succeeds. Serialize overlapping local mutations where necessary.

## 3. Scope and data contracts

### Trip metadata

- Add `isFavorite=false` and `visited=false` to Trip, TripSummary, both serializers, and backward-compatible local decoding.
- `PATCH /trips/{id}` accepts only those metadata fields, with explicit boolean values rather than a server-side toggle.
- Prefer a narrow metadata response and merge only those fields in the client. Validate concurrent metadata/itinerary updates and delayed response handling.
- The favorites screen initially filters existing trip summaries; no separate favorites service is needed.

### Saved places

- Add `GET/POST /me/saved-places` and `DELETE /me/saved-places/{id}`.
- Agree on one save reference: `provider`, `kind`, and `externalId`. Distinguish catalog/Google and destination/place; a destination's internal ID is not necessarily a Google Place ID.
- The backend supplies the owner and enforces a unique `(owner, provider, kind, externalId)` key, including concurrent requests.
- Store stable references, using catalog data and existing provider-detail/cache behavior for presentation. Do not permanently copy entire provider responses.
- A reference whose details are unavailable must remain removable. Deleting a trip does not delete independently saved places.

### Journals and photos

- One plain-text journal per trip, at most 5,000 characters; agree on Unicode counting and empty-text behavior across TypeScript/Python.
- Add `GET/PUT/DELETE /trips/{id}/journal`, owned-trip checks, and database cascade deletion.
- Create journals for past or explicitly visited trips. Removing visited status must not erase existing text; settle continued editing and midnight/time-zone behavior before implementation.
- Use explicit save, preserve edits on failures, and avoid opening an empty editor after a failed read.
- Keep one optional photo in persistent device storage, under an agreed account/guest namespace. Never send local paths in cloud journal payloads.
- Replacement must copy the new file and persist its association before deleting the previous file. Cancellation leaves the current photo unchanged.
- Plan recoverable cleanup because storage keys, files, and the remote database do not share a transaction.

## 4. Development increments and gates

| Increment | Work | Evidence before moving on |
| --- | --- | --- |
| 1. Favorite contract and local persistence | Confirm schema ownership; add metadata defaults, strict local mutations, and tests | Old trips remain readable; favorites survive a new adapter instance; write failure does not display success; version unchanged |
| 2. Favorite trip journey | Add card/detail controls and Profile favorites; add the owned remote PATCH using the agreed schema | All trip views agree; restart persists; metadata does not invalidate an adjustment preview |
| 3A. Saved-place persistence | Add explicit reference identity, local/remote adapters, owned endpoints and database uniqueness | Concurrent saves deduplicate; failures reject; references stay removable without provider lookup |
| 3B. Saved-place journey | Complete Figma frames, shared save control, Saved list/details/remove and provider resolution | Native flow matches the reviewed design; unavailable entries stay removable; Nearby integration example works |
| 4. Visited status and journal text | Add explicit visited controls, eligibility rules, editor, owned endpoints, cascade and failure handling | Past is not visited; draft survives failed save; deleted trip removes its journal but preserves saved places |
| 5. Device-local photo | Use Expo ImagePicker/FileSystem, namespace association, replace/remove, and missing-file handling | Real gallery selection and restart on both simulators; no local URI enters cloud requests |
| 6. Account/provider integration | Connect the auth owner's final shared API/scope/reset contracts and Nearby entry point | A/B isolation, late-response protection, cloud text across two installations, photos explicitly device-local |
| 7. Release checks and review preparation | Fix regressions, run required checks, and record limitations | Original generation/maps/adjustments still work; actual evidence distinguishes mocks and real services |

Deliver one increment per development session. Increments 1 and 2 establish trip metadata persistence and the Favorite Trips journey. The outstanding Android/native checks remain required for full acceptance. If UI tooling is unavailable, independent persistence work can continue in a separate slice; do not mark the native gate complete.

## 5. Seven-day capacity plan

The original Sprint 3 dates are November 2–8. Use the following seven development days if work starts earlier. The complete scope is estimated at 30–40 person-hours, not one person's 10–15-hour part-time week.

| Day | Budget | Target |
| --- | --- | --- |
| D1 | 4h | Contracts, schema ownership, fixtures, design inventory, and increment 1 |
| D2 | 5h | Complete the favorite trip journey and owned metadata endpoint |
| D3 | 6h | Saved places and a shared integration hook/button |
| D4 | 5h | Explicit visited status and journal text |
| D5 | 6h | Device-local photo lifecycle and first native checks |
| D6 | 4h | Real account/Nearby integration, cross-install and failure scenarios |
| D7 | 6h | Buffer, fixes, regression checks, evidence and handoff |

Treat the budgets as estimates. Repair failed acceptance before expanding scope. With only 10–15 hours available, commit to contracts, working favorites, and the beginning of saved-place storage; carry journals/photos/integration into subsequent weeks.

## 6. Dependencies, mocks, and blocked work

| Dependency | Required agreement | Work possible while waiting | Real acceptance gate |
| --- | --- | --- | --- |
| Auth owner | Current API instance, stable internal user ID, guest/account storage scope, reset/cancellation lifecycle | Inject explicit guest/A/B fixtures and delayed responses; use real guest persistence | Real token-bearing private requests, account switching, ownership and cross-install tests |
| Database owner | One schema definition for metadata, saved places and journals; isolated dev and `_test` databases | Local adapter and request-contract tests | PostgreSQL uniqueness, cascade, concurrency, and approved shared-database upgrades |
| Nearby owner | The same provider/kind/externalId save input | Existing Explore/activity save entry points and nearby-shaped fixtures | The merged Nearby screen can save and reopen an item |
| Google provider | Stable references and detail/cache resolution | Catalog data, mock details, unavailable/404/502 cases | Live provider re-resolution; unavailable references remain removable |
| Native image APIs | SDK-57-compatible dependencies and native builds | Picker cancellation, copy failure, missing file, and scope-change mocks | System gallery, persistent file reads after restart on iOS/Android |
| Figma | Applicable frames and review for new feature screens | Existing Profile/trip components and nonvisual contracts | Confirmed layout reference and native visual comparison |

The local design now contains ten first-delivery Favorite Trips frames and is kept outside the repository. Navigation must reuse the original icon-and-label four-tab bar: Trips, Explore, Saved, Profile. Favorite Trips remains under Profile, as explicitly specified by the original Sprint 3 document. Saved Places is intended for Saved; that tab placement is a design decision because the original sprint does not specify its navigation location. Do not move Favorite Trips into Saved without updating this decision. Saved Places and journal-editor designs remain later work. Do not treat the existing home container named “Trip journal” as a journal-editor specification.

The navigation correction has been written to the local design artifact. Figma became unresponsive during re-import, so that corrected artifact still needs visual verification. Increment 1 contains no screen or navigation changes and makes no claim of native visual acceptance.

Do not change `core/auth.py`, auth session/provider code, or the root login flow in this branch to work around missing handoffs. A mocked identity is never evidence of authenticated privacy. Do not publicly deploy the current X-User-Id development backend.

Local mode is a real supported implementation, not a mock. Use existing Jest/fetch mocks, PostgreSQL fixtures and injectable providers rather than adding a second mock application. Gemini is not a prerequisite for collections: generate fixtures from the bundled catalog/history helpers.

If auth or PostgreSQL is late, continue local persistence and UI/contract work, then mark remote privacy/database checks as blocked. Never silently save failed cloud writes into guest storage. If native selection is blocked, report photos as incomplete rather than substituting a static image.

## 7. Regression and collaboration checklist

- [x] Confirm metadata defaults across legacy local records, generation, Trip and TripSummary, including backend serialization.
- [x] Confirm strict local writes and overlapping mutations do not lose user changes in adapter tests.
- [x] Confirm favorite and visited metadata updates leave itinerary version and valid proposals intact.
- [ ] Confirm the same invariant for journal operations when implemented.
- [ ] Confirm provider/kind ID distinctions and concurrent saved-place deduplication.
- [ ] Confirm journal ownership, length boundaries, time-zone rules, failed read/save behavior and cascade deletion.
- [ ] Confirm picker cancellation, file replacement/cleanup, missing files and switching accounts during selection.
- [ ] Confirm real A/B isolation and cloud text persistence on a second installation.
- [ ] Coordinate changes to shared types, API adapters, Store, Profile, ActivityDetailSheet, app config and dependency lockfile with their owners.
- [ ] Run the relevant type/lint/unit/bundling/PostgreSQL/native checks from `docs/contributing.md` at the appropriate increment.
- [ ] Keep the original demo database and uncommitted local notes intact; do not reset shared account data.
- [ ] Create the PR only after the agreed functionality and acceptance evidence are complete.

## 8. Current status

The retired authentication branch was removed locally and remotely, with committed history backed up outside the repository. This branch starts from main and excludes retired authentication changes and other developers' unmerged branches. Fetch on October 29 still showed `main@48d627b` and `authentication-with-clerk@371c758`; no new account database baseline was available. No shared database or authentication implementation was modified.

### Increment 1: persistence boundary

- Required `isFavorite` and `visited` booleans default legacy trip/detail summaries to false. Explicit metadata patches return only `{ id, isFavorite, visited }`.
- Local mutations share a queue per storage key and read fresh committed records. Favorite, delete, fixture insertion and adjustment application use this boundary. The queue coordinates adapters within one JavaScript runtime, not separate processes.
- Strict storage writes reject failures before publishing success. Valid legacy records remain readable next to malformed entries; writes preserve unreadable entries and unknown fields for recovery. Corrupt containers and read failures reject rather than displaying false empty states.
- Metadata does not change itinerary dates, contents, creation time or version. Dated fixture refresh preserves metadata; a failed adjustment write retains the proposal for retry.
- October 28 validation: 82 frontend tests, typecheck, lint and both platform JavaScript exports passed. Storage tests use the official AsyncStorage Jest mock and fresh adapter instances.

### Increment 2: Favorite Trips journey

- Shared card/detail favorite controls use explicit desired values, show a pending state across views and publish confirmed writes only. The heart is a sibling of the card's navigation control. Removing a favorite from detail leaves the trip open.
- Profile links to Favorite Trips with a live count. The list filters existing summaries, with loading, empty, read-failure/retry and pull-to-refresh states. It uses the approved paper/forest/mint palette, typography and white-body trip cards.
- The four icon-and-label tabs are Trips, Explore, Saved and Profile. Saved is a truthful coming-soon shell; place saving is still increment 3.
- Store merges metadata without replacing itinerary data. Metadata epochs protect writes from delayed list/detail reads; itinerary versions protect newer cached plans. Repeated matching writes coalesce, opposing writes serialize and late responses do not resurrect deleted trips.
- The remote PATCH applies its owner predicate in the SQL UPDATE, changes only supplied booleans and the update timestamp, and returns narrow metadata. It preserves itinerary versions and valid adjustment proposals.
- Models define the new columns for fresh databases. `backend/scripts/sql/001_trip_collection_metadata.sql` is an explicit, one-time legacy upgrade; review the target schema with the account database owner before applying it. Startup never runs it automatically. The upgrade was exercised only in a disposable test database.
- October 29 validation: frontend typecheck/lint and all 96 tests in 9 Jest suites passed with `--runInBand --watchman=false`; iOS and Android JavaScript exports passed. Backend regression: all 96 tests passed against isolated PostgreSQL 14. Tests include strict payloads, owner filtering, concurrent itinerary/metadata writes, independent partial metadata updates, transaction rollback and legacy upgrade preservation.
- Backend tests used new loopback-only development/test databases, separate from any shared database. The TS parity fixture was regenerated with the added default flags; scheduler output still matches.

### Native acceptance on October 29

| Check | Evidence | Remaining limit |
| --- | --- | --- |
| iOS local mode | iPhone 18 Pro / iOS 27, Expo Go 57.0.9: icon tabs, Profile count, populated and empty favorites, card save without navigation, detail removal while staying on detail, consistent return state | Exact Figma pixel comparison and accessibility/font-scale review still pending |
| Local restart | Closed Expo Go through the iOS app switcher, relaunched, and observed the saved heart restored | Not a two-installation or authenticated-account test |
| Real remote mode | Separate Metro session and actual FastAPI HTTP/RemoteApi calls against isolated PostgreSQL; simulator PATCH returned 200 and database row stayed at itinerary version 1 | Uses the existing development identity transport, not Clerk |
| Remote failure/retry | Stopped the backend; save showed retry guidance and retained the committed heart. Restarted backend and Expo Go; saved state restored and retry succeeded | Automated screen/state failure cases use Jest mocks; no production outage test |
| Android | Pixel_10 emulator launched and SDK-compatible Expo Go installed; Android JavaScript export passed | UI control could not bind the emulator window, so native interaction, restart and visual acceptance are pending |
| Generation/maps/adjustments | Backend scheduler/adjustment regression and frontend suites passed; metadata preserved valid proposals | Native map tiles/markers/routes and full generation flow in both modes on both platforms still need the release checklist |

The original corrected local design artifact still needs Figma re-import verification. Native screens were visually reviewed against the recorded design specification; this does not claim a completed pixel comparison. No new frontend dependency or native build configuration was added.

The owner predicate is tested with the existing `X-User-Id` development dependency. It is not verified account privacy. Clerk token verification, stable account/guest scoping, account switching and cross-installation acceptance remain increment 6 handoffs.

### Increment 3A: saved-place identity and persistence

- Fetch on October 29 found Nearby advanced to `7fe32b1`; its `NearbyResults.source` and `NearbyPlace.place.id` can form explicit place references. No other branch was merged or messaged.
- Added the proposed `SavedPlaceReference`/`SavedPlace` contract, shared validation and a structured identity key. See [Saved-place integration contract](../saved-place-contract.md) for payloads and mapping examples. This is implemented on this feature branch; it is not an agreement or deployment by the auth/Nearby owners.
- Local and remote adapters expose `listSavedPlaces`, `savePlace` and `removeSavedPlace`. Only reference fields, an entry ID and creation time are persisted; presentation will reuse catalog/provider detail resolution in 3B.
- Local trip and collection repositories reuse the existing queue implementation through one shared storage-lock utility. Saved references use the explicit guest key `wayfare.guest.savedPlaces.v1`. Fresh reads and strict writes protect concurrent adapters; failures reject rather than publishing success. Unknown fields and malformed entries are retained for recovery.
- The new collections feature owns GET/POST/DELETE `/me/saved-places`. PostgreSQL enforces owner/provider/kind/reference uniqueness. Repeated saves retain ID and creation time; an atomic upsert handles competing saves without a conflict-then-read race with removal. A bounded SHA-256 index key supports long opaque external IDs; the exact original text is checked before returning an existing reference.
- Saved references have a user foreign key and no trip foreign key. Trip deletion preserves them; user deletion cascades. Persistence never calls Google, Gemini or destination resolution, so a stale/unavailable reference can still be listed or removed.
- Upgrade 002 was exercised in the disposable test database and applied only to the isolated local development database. No shared database was upgraded. Models remain the baseline for fresh databases.
- Validation: frontend typecheck/lint and all 120 tests in 10 Jest suites passed; iOS and Android JavaScript exports passed. The full backend suite passed 119 tests against real isolated PostgreSQL 14. Coverage includes cross-adapter concurrency, failures/retry, corrupt storage, exact reference distinctions, long IDs, database uniqueness, digest-collision rejection, owner filtering, rollback and deletion boundaries.
- Actual loopback HTTP smoke passed create/repeated save/list/owner predicate/delete against FastAPI and isolated PostgreSQL. Frontend transport tests use mocked fetch; local persistence tests use the official AsyncStorage Jest mock. There is no new Saved Places native UI in this slice, and no live Google or Clerk acceptance is claimed.
- Android is connected through adb, but its native window is still absent from the UI-control inventory. Existing Android visual/interaction/restart gates remain open. No new dependency or native configuration was added.

Next session: complete Saved Places Figma states using the existing four-icon navigation, then implement 3B with provider-aware resolution and a reusable save action. Keep the Android acceptance task open. Journal and photo work has not started. Do not open a PR yet.
