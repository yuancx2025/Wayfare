# Sprint 4 — Geolocation and Nearby Discovery

[Overall roadmap](../wayfare-v2-roadmap.md) · [Previous: Collections and Memories](sprint-3-collections-and-travel-memories.md) · [Next: Insights and Release](sprint-5-insights-integration-and-release.md)

**Dates:** November 9–15, 2026.

**Priority:** P0.

**Goal:** Add an understandable foreground-location experience without making location access mandatory.

This is a planning document. Depends on Sprint 2's authenticated live discovery and Sprint 3's Save Place behavior. Shared capacity and delivery rules are defined in the overall roadmap.

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
- Default to a 2 km radius, allow up to 5 km, and return at most 20 results ordered by distance.
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

- [ ] Granted permission produces a position and nearby results at a supported simulated location.
- [ ] Denial, "do not ask again," disabled services, and timeouts leave manual search usable.
- [ ] Category, distance ordering, and radius filtering work in both adapters.
- [ ] Catalog mode never presents distant catalog places as nearby.
- [ ] A nearby item can be saved and reopened.
- [ ] Provider failures show a recoverable state without fabricating results.
- [ ] Location activity stops when the interaction ends; no background tracking is introduced.

**Deliverable:** Location-aware Explore and Map flows demonstrated with simulated coordinates on both platforms.

**Deferred:** Background location, geofencing, next-stop directions, and automatic itinerary adjustments.
