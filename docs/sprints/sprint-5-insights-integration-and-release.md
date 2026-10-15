# Sprint 5 — Insights, Integration, and Classroom Release

[Overall roadmap](../wayfare-v2-roadmap.md) · [Previous: Location and Discovery](sprint-4-geolocation-and-nearby-discovery.md)

**Dates:** November 16–22, 2026.

**Priority:** P0 for deterministic insights, integration, release artifacts, and presentation preparation.

**Goal:** Deliver a coherent, demonstrable V2 and finish all presentation preparation before the break.

This is a planning document. Depends on the four previous sprint deliverables. Shared capacity and delivery rules are defined in the overall roadmap. There is no scheduled development during November 23–29.

## Committed implementation

### Deterministic insights — Frontend and Backend owners

- Add `GET /me/insights` and an equivalent guest calculation.
- Report planned-trip totals separately from confirmed visited-trip and visited-country totals.
- Count visited countries only from explicitly visited trips.
- Derive top activity categories from saved places and favorited-trip activities, deduplicating repeated place identifiers.
- Add a short preference-based travel summary labelled "Based on your preferences."
- Keep these insights functional without Gemini. Existing Gemini planning/adjustment functionality remains the AI demonstration.

### Account lifecycle and reliability — Backend owner

- Complete authenticated `DELETE /me` and retry-safe Clerk/Neon cleanup.
- Block accounts pending deletion; verify Clerk webhook signatures and handle duplicate delivery safely.
- Cascade deletion through trips, journals, saved places, and proposals; clear the current installation's account photo storage.
- Finish hosted-backend cold-start handling, generation interruption/retry behavior, and bounded expensive requests.
- Validate all final schema changes against an isolated database before applying them to the shared account database.

Free Render services can sleep when idle, so cold-start recovery must be part of release acceptance. See [Render free hosting](https://render.com/docs/free).

### Release artifacts — Integration/QA owner

- Produce an installable signed Android APK and an iOS Simulator build.
- Validate the Android Maps key against the actual release signing certificate.
- Finalize icons, splash behavior, accessibility labels, loading states, and empty/error screens.
- Prepare a reproducible simulator setup with gallery images and named locations.
- Run a second clean installation against the same account to demonstrate cloud persistence.
- Record known limitations, installation instructions, and the exact tested build versions.

### Presentation — Shared ownership

Prepare a short demonstration covering:

1. Local guest planning.
2. Account sign-in and private cloud trips.
3. Profile/preferences and travel history.
4. Favorites, saved places, and a journal photo.
5. Simulated location and nearby discovery.
6. Confirmed-visit insights.
7. Google Places/Routes and Gemini integrations.

Prepare slides, screenshots, an architecture summary, and a clearly labelled backup recording by November 22.

## Weekly execution

| Dates | Work |
| --- | --- |
| November 16–18 | Implement insights and close account-lifecycle gaps; stop adding optional features. |
| November 19–20 | Complete regression testing and produce release candidates. |
| November 21–22 | Resolve release-blocking defects, rehearse, and archive final builds and presentation assets. |

## Final acceptance

- [ ] Complete the main journey on iOS Simulator and Android emulator using the final builds.
- [ ] Verify two-account isolation across profiles, trips, collections, journals, and insights.
- [ ] Verify guest persistence and account restoration after restart.
- [ ] Confirm truthful planned-versus-visited statistics.
- [ ] Demonstrate gallery selection and location using simulator/emulator facilities.
- [ ] Demonstrate live Google and Gemini integrations; keep local/failure behavior usable.
- [ ] Pass frontend type checking, lint, relevant tests, native bundling, backend tests, and PostgreSQL checks.
- [ ] Preserve the original trip-generation and adjustment workflows.
- [ ] Record physical-device testing, TestFlight, and public-store distribution as **not verified or delivered**.

**Deliverable:** Wayfare V2 classroom release, signed Android APK, iOS Simulator artifact, installation guide, test evidence, demonstration recording, and final presentation materials.

**Deferred beyond the course:** Apple/store distribution, physical-device acceptance, cloud photo synchronization, advanced AI Travel DNA, public profiles, collaboration, offline cloud editing, shareable recaps, and continuous location features.
