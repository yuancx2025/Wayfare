# Sprint 1 — Profile Redesign and Trip History

[Overall roadmap](../wayfare-v2-roadmap.md) · [Next: Authentication](sprint-2-authentication-and-private-accounts.md)

**Dates:** October 19–25, 2026.

**Priority:** P0.

**Goal:** Turn Profile into a useful personal travel hub while preserving the existing planning workflow.

This is a planning document. Shared capacity, release boundaries, and delivery rules are defined in the overall roadmap.

## Committed implementation

### Profile and navigation — Frontend owner

- Keep the Trips / Explore / Profile bottom tabs.
- Convert Profile into a nested navigation stack containing the overview, Edit Profile, Travel Preferences, and Trip History screens.
- Retain the green-and-cream visual language, existing typography, shared cards, and preference controls.
- Show name, home location, initials avatar, planned-trip statistics, and recent past trips.
- Prepare lightweight Figma wireframes for these four screens before implementing their layout.

The existing [Profile screen](../../frontend/app/%28tabs%29/profile.tsx) supplies the starting profile and preference functionality.

### Profile persistence — Backend owner

- Add `PATCH /me` accepting partial updates to `name` and `home`, returning the updated `Me`.
- Trim inputs; require a nonempty name; respect the existing 120-character field limits.
- Add equivalent local profile persistence and an API adapter method for updating it.
- Keep Wayfare's display name and home location app-owned. Authentication email and credentials will belong to Clerk in Sprint 2.
- Preserve existing preference endpoints and their behavior.

### Trip history — Frontend and Integration/QA owners

- Introduce one shared date-classification helper:
  - Upcoming: start date is after today.
  - Ongoing: today falls within the inclusive start/end range.
  - Past: end date is before today.
- Use the device's local calendar date and existing date-only trip values.
- Show ongoing trips first, upcoming trips by nearest start date, and past trips by most recent end date.
- Replace the current automatic "Completed" date label with "Past." Actual visits will require confirmation in Sprint 3.
- Label existing country statistics as **countries planned**.

### Correctness and delivery foundations — Backend and Integration/QA owners

- Fix proposal application in a separate correctness PR: ownership check, expected-version check, itinerary update, and proposal consumption must be atomic.
- Establish shared API error handling, lint configuration, and a repeatable validation checklist.
- Configure application identifiers and initial development/build profiles; verify the current app builds for both simulators.
- Agree on the Sprint 2 account/collections schema before implementation begins. Do not expose the anonymous backend publicly.

## Weekly execution

| Period | Work |
| --- | --- |
| Early week | Finalize wireframes, profile API contract, trip classifications, and database design. |
| Midweek | Implement screens and persistence; complete the atomic-update correction independently. |
| End of week | Integrate, test both modes, and demonstrate the complete profile/history journey. |

## Acceptance and handoff

- [ ] Name, home, and preferences survive app restart in their respective storage modes.
- [ ] Invalid profile updates retain entered values and show useful errors.
- [ ] History handles trips starting today, ending today, crossing months, and having no past trips.
- [ ] Opening a history item reaches the existing itinerary.
- [ ] Two conflicting proposal applications produce one success and one `409`; expired proposals retain `410`.
- [ ] Existing generation, maps, and adjustments still work.

**Deliverable:** Profile V2, editable profile data, separate preferences, trip history, and a passing concurrency regression.

**Deferred:** Custom avatar images, collections screens, and changes to planner algorithms.
