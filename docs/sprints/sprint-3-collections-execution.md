# Collections and travel memories: incremental execution

Prepared on October 28, 2026, against `main@48d627b`.
Working branch: `feature/collections-and-memories`.

Build one reviewable slice at a time. Commit and push completed increments, and open a pull request after the agreed feature scope is complete. Application code, tests, and implementation documentation are written in English. Keep earlier chat analysis and temporary design files outside the repository.

## 1. Current ownership and branch boundaries

- Authentication is being implemented on `origin/authentication-with-clerk` (inspected at `371c758`). Do not duplicate it, merge it implicitly, or restore our retired authentication transport work into this branch.
- Nearby discovery is being implemented on `origin/ziqi/sprint-4-location-nearby` (inspected at `7173dba`). Provide reusable save actions for its owner to connect.
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
| 3. Saved places | Implement reference identity, local/remote storage, unique constraint, list/details/remove, and a shared save action | Duplicate and concurrent saves deduplicate; provider failures are recoverable; Nearby owner has a small integration example |
| 4. Visited status and journal text | Add explicit visited controls, eligibility rules, editor, owned endpoints, cascade and failure handling | Past is not visited; draft survives failed save; deleted trip removes its journal but preserves saved places |
| 5. Device-local photo | Use Expo ImagePicker/FileSystem, namespace association, replace/remove, and missing-file handling | Real gallery selection and restart on both simulators; no local URI enters cloud requests |
| 6. Account/provider integration | Connect the auth owner's final shared API/scope/reset contracts and Nearby entry point | A/B isolation, late-response protection, cloud text across two installations, photos explicitly device-local |
| 7. Release checks and review preparation | Fix regressions, run required checks, and record limitations | Original generation/maps/adjustments still work; actual evidence distinguishes mocks and real services |

Deliver one increment per development session. Increment 1 establishes the storage and adapter boundary; the next increment adds the user-visible favorite journey and its backend implementation.

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

- [x] Confirm frontend metadata defaults across old local records, generation, Trip and TripSummary; backend serialization is deferred to increment 2.
- [x] Confirm strict local writes and overlapping mutations do not lose user changes in adapter tests.
- [ ] Confirm favorite/visited/journal operations leave itinerary version and valid proposals intact.
- [ ] Confirm provider/kind ID distinctions and concurrent saved-place deduplication.
- [ ] Confirm journal ownership, length boundaries, time-zone rules, failed read/save behavior and cascade deletion.
- [ ] Confirm picker cancellation, file replacement/cleanup, missing files and switching accounts during selection.
- [ ] Confirm real A/B isolation and cloud text persistence on a second installation.
- [ ] Coordinate changes to shared types, API adapters, Store, Profile, ActivityDetailSheet, app config and dependency lockfile with their owners.
- [ ] Run the relevant type/lint/unit/bundling/PostgreSQL/native checks from `docs/contributing.md` at the appropriate increment.
- [ ] Keep the original demo database and uncommitted local notes intact; do not reset shared account data.
- [ ] Create the PR only after the agreed functionality and acceptance evidence are complete.

## 8. Current status

- The retired authentication branch has been removed locally and remotely; its committed history is backed up outside the repository.
- This branch is based on current main and does not include the retired authentication changes or the other developers' unmerged feature branches.
- Increment 1 implements required `isFavorite` and `visited` booleans in frontend trip/detail summaries, defaults legacy reads to false, and adds explicit metadata patches returning only `{ id, isFavorite, visited }`.
- Local trip operations share a queue per storage key and read fresh committed records. Favorite, delete, sample/fixture insertion, and adjustment application all use that boundary. No in-memory success is published before a strict write completes. This queue coordinates adapters within one JavaScript runtime; it is not a cross-process storage transaction.
- Valid legacy entries remain readable next to malformed entries. Writes retain the unreadable entries and unknown fields for recovery. Storage read failures, malformed JSON, invalid collection containers, and collections with no readable entries reject rather than displaying a false empty state.
- Metadata updates preserve itinerary dates, contents, creation time, and version. Refreshing dated fixtures preserves collection metadata. Failed adjustment writes retain the preview for retry.
- The remote adapter normalizes legacy trip responses and includes the proposed metadata PATCH contract. Network tests use mocked fetch; a working server endpoint, PostgreSQL persistence, and authenticated ownership are not delivered by this increment.
- Validation on October 28: frontend typecheck and lint passed; all 82 tests in 7 Jest suites passed using `npm test -- --runInBand --watchman=false`. Watchman is disabled because its state directory is outside this workspace's sandbox. iOS and Android JavaScript exports passed. Persistence/failure/concurrency tests use the official AsyncStorage Jest mock and fresh adapter instances; simulator restart, native visual checks, real backend requests, and PostgreSQL acceptance remain pending.
- Next: implement the owned backend PATCH without resetting a database, merge metadata into the Store without replacing itinerary data, then connect the reusable card/detail action and Profile Favorite Trips states to the approved visual reference.
