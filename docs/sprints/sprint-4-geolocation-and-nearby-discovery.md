# Sprint 4 — Geolocation and Nearby Discovery

[Overall roadmap](../wayfare-v2-roadmap.md) · [Previous: Collections and Memories](sprint-3-collections-and-travel-memories.md) · [Next: Insights and Release](sprint-5-insights-integration-and-release.md)

**Dates:** November 9–15, 2026.

**Priority:** P0.

**Goal:** Add an understandable foreground-location experience without making location access mandatory.

This is a planning document. Depends on Sprint 2's authenticated live discovery and Sprint 3's Save Place behavior. Shared capacity and delivery rules are defined in the overall roadmap.

## Status — started early (October 21, 2026)

Implemented ahead of schedule on branch `ziqi/sprint-4-location-nearby`, before Sprints 2 and 3. Two parts wait on those sprints:

- **Authentication:** `POST /places/nearby/search` uses today's `X-User-Id` identity. It moves to Clerk sessions with every other private route in Sprint 2.
- **Save Place:** nearby results cannot be saved until Sprint 3 adds Save Place.

Verified on the iOS Simulator (iPhone 17, Expo Go) with simulated locations, live Google Places, and the hosted Neon dev database. **Not yet verified on the Android emulator.**

| What | Where |
| --- | --- |
| Location permission (`LocationPermissionProvider`, `useLocationPermission`) | `frontend/src/state/locationPermission.tsx` |
| Shared position fix (`LocationProvider`, `useCurrentLocation`) | `frontend/src/state/location.tsx` |
| Nearby section on Explore | `frontend/src/components/NearbySection.tsx` |
| "My location" on the day map | `frontend/app/trip/[id]/map.tsx` |
| "How far am I from here?" on every stop | `frontend/src/components/ActivityDetailSheet.tsx` |
| Guest-mode ranking (shared rules) | `frontend/src/domain/logic/nearby.ts` |
| Endpoint and limits | `backend/app/features/discovery/` (`schemas.py`, `service.py`, `places_router.py`) |
| Provider support | `around()` in `backend/app/integrations/places/` (`protocol.py`, `catalog.py`, `google.py`) |

Decisions worth knowing:

- Nearby opens on **Attractions** (culture, museums, nature, architecture) for travelers; **Food** and **All** (adds shopping and nightlife) are one tap away. The server keeps only the requested categories, because Google tags some cafes and markets as tourist attractions.
- Nearby shows the 5 closest places with "Show all", and the section can be hidden once results are on screen.
- One fix is shared by Explore, the day map and stop details (`LocationProvider` at the root), so the user is asked once per session. The position stays in memory only.
- Permission is tracked separately from the fix (review on PR #2). It is checked silently at launch and on every return to the foreground, without a prompt or a GPS read, so "don't ask again" shows Settings up front and a permission granted in Settings takes effect without restarting.
- Google results are ranked by distance (`rankPreference: DISTANCE`). Planner searches keep popularity ranking.
- User-position searches skip the shared `place_cache`. Its key would keep the position for hours. Each refresh is one Places call.
- The day map hides the user's dot when they are more than 50 km from that day's stops, and shows the distance instead. Otherwise the map would zoom out to fit both.
- Every native location call has a timeout (5 s for checks, 15 s for a fix). Only the system permission prompt waits indefinitely.

## Committed implementation

### Location experience — Frontend owner

- Add Expo Location and a reusable current-location hook.
- Request foreground access only after "Use my location" is selected.
- Handle permission status, disabled services, acquisition timeout, and approximate results.
- Show the returned position on the map and provide an explicit refresh action.
- Retain manual destination search throughout.
- Add Nearby categories for food, attractions, and all supported places.
- Display approximate straight-line distances, clearly distinguished from walking routes.

Use foreground location APIs and configure the relevant permission descriptions. See [Expo Location](https://docs.expo.dev/versions/v57.0.0/sdk/location/).

### Coordinate-based discovery — Backend owner

- Add authenticated `POST /places/nearby/search` accepting latitude, longitude, radius, and category.
- Default to a 2 km radius, allow up to 30 km, and return at most 20 results ordered by distance. *(Raised from 5 km in review on PR #2: 5 km was too narrow for attractions and restaurants.)*
- Return normalized places, distance in meters, and the actual result source.
- Add coordinate-based provider support while preserving existing planner/adjustment calls.
- Reuse Google's nearby-search client for live results.
- For catalog mode, search bundled places and apply real distance/radius filtering. Outside supported areas, return an honest empty state.
- Use request coordinates transiently; do not attach them to user profiles, journals, or trips, or record them in application logs.

The existing [place-provider contract](../../backend/app/integrations/places/protocol.py) already supports destination-bound nearby searches; this sprint adds the user-location entry point.

### Guest behavior and native QA — Integration/QA owner

- Implement nearby filtering over the bundled catalog in guest mode.
- Label catalog results and unavailable live services accurately.
- Feed nearby results into Sprint 3's existing Save Place action.
- Prepare named simulator locations inside and outside catalog coverage.
- Verify maps in the app's own Android build, including its package/signing-key restrictions.

## Weekly execution

| Period | Work |
| --- | --- |
| Early week | Finalize the request/response contract and permission states. |
| Midweek | Implement coordinate search, local parity, nearby cards, and map positioning. |
| End of week | Run simulated-location, permission, provider-failure, and map regression scenarios. |

## Acceptance and handoff

- [x] Granted permission produces a position and nearby results at a supported simulated location. *(iOS: Chicago Loop and Chelsea, live Google.)*
- [x] Denial, "do not ask again," disabled services, and timeouts leave manual search usable. *(Denial checked on iOS; all states covered by `current-location.test.ts`.)*
- [x] Category, distance ordering, and radius filtering work in both adapters. *(pytest and Jest.)*
- [x] Catalog mode never presents distant catalog places as nearby.
- [ ] A nearby item can be saved and reopened. *(Blocked on Sprint 3 Save Place.)*
- [x] Provider failures show a recoverable state without fabricating results. *(Backend returns 502; the app shows Try again.)*
- [x] Location activity stops when the interaction ends; no background tracking is introduced. *(One-shot fixes only; no `watchPositionAsync`.)*

**Deliverable:** Location-aware Explore and Map flows demonstrated with simulated coordinates on both platforms. *(iOS done; Android emulator pending.)*

**Deferred:** Background location, geofencing, next-stop directions, and automatic itinerary adjustments.
