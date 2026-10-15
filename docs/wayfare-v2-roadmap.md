# Wayfare V2 — Fall 2026 Development Roadmap

Status: planning documents approved for publication on October 15, 2026. These documents describe planned work, not implemented or verified capabilities.

## Project overview

Build a personal travel hub, secure its data, add collections and native features, then finish with a reliable classroom release.

- **Project:** Wayfare — AI-Powered Travel Companion.
- **Course:** ECE 590 — Cross-Platform Mobile Development.
- **Stack:** React Native, Expo SDK 57, Expo Router, TypeScript, FastAPI, Neon PostgreSQL, Clerk, Google Maps/Places/Routes, and Gemini.
- **Development:** Five one-week sprints, October 19–November 22, 2026.
- **Break:** November 23–29; no scheduled development.
- **Final presentation:** November 30–December 2.

## Concise sprint plan

| Sprint | Dates, 2026 | Primary outcome | Required demonstration |
| --- | --- | --- | --- |
| [1 — Profile and History](sprints/sprint-1-profile-and-history.md) | October 19–25 | Editable profile, separate preferences, organized trip history | Edit a profile, restart, and reopen a past itinerary |
| [2 — Authentication](sprints/sprint-2-authentication-and-private-accounts.md) | October 26–November 1 | Verified email accounts, private cloud data, local guest mode | One account across two app installations; another account denied access |
| [3 — Collections and Memories](sprints/sprint-3-collections-and-travel-memories.md) | November 2–8 | Favorite trips, saved places, journal text, one local photo per trip | Save a place, favorite a trip, and reopen a journal after restart |
| [4 — Location and Discovery](sprints/sprint-4-geolocation-and-nearby-discovery.md) | November 9–15 | Foreground location and nearby places | Simulate a location, discover nearby places, and handle denied permission |
| [5 — Insights and Release](sprints/sprint-5-insights-integration-and-release.md) | November 16–22 | Deterministic insights, integrated app, release artifacts | Complete the main journey on iOS Simulator and Android emulator |

The linked documents contain each sprint's implementation scope, public interfaces, ownership, weekly sequence, acceptance criteria, and deferred work.

## Team and capacity

Assume three part-time developers, approximately 10–15 hours each per week.

| Owner | Responsibilities |
| --- | --- |
| Frontend | Screens, navigation, forms, and interaction states |
| Backend | APIs, authentication, persistence, and database changes |
| Integration/QA | Local-mode parity, native integrations, builds, testing, and demonstration preparation |

## Release boundary

Require a signed Android APK and an iOS Simulator build. No paid Apple membership or physical devices are assumed. TestFlight, iPhone distribution, and physical-device validation are deferred. Expo supports a dedicated iOS Simulator build configuration; see [Expo simulator builds](https://docs.expo.dev/build-reference/simulators/).

Gallery selection and location demonstrations use seeded images and simulated coordinates. Record those as simulator/emulator evidence, not physical-device validation.

## Delivery rules

- **P0:** Committed work required for the classroom release.
- **P1:** Start only after the sprint's P0 acceptance passes and capacity remains.
- **P2:** Advanced AI, cloud photos, sharing, and collaboration; deferred beyond the course.
- Start build configuration in Sprint 1 and hosted-backend integration in Sprint 2.
- Preserve the current database; initialize one fresh account database in Sprint 2. Include the agreed collections fields and tables in that baseline. Later changes use reviewed, checked-in SQL upgrades without restoring Alembic or resetting shared account data.
- Each sprint finishes with reviewed changes, relevant automated checks, iOS/Android runtime evidence, and a short demonstration.
- Prepare builds, recordings, slides, and installation instructions by November 22. November 23–29 contains no scheduled development.

## Definition of completion

1. The existing trip-generation and adjustment workflows remain reliable.
2. Profiles, preferences, history, favorites, saved places, journals, and basic insights function.
3. Verified accounts have isolated cloud data; guests retain the local planner.
4. The same account can retrieve cloud data from separate app installations.
5. Gallery and foreground-location features are demonstrated on iOS Simulator and Android emulator.
6. Live Google and Gemini integrations are demonstrated, with usable failure/local states.
7. The final Android APK and iOS Simulator artifact, installation guide, test evidence, recording, and presentation materials are ready by November 22.
8. Physical-device testing, TestFlight, and public-store distribution are explicitly recorded as not verified or delivered.

## Deferred beyond the course

Apple/store distribution, physical-device acceptance, cloud photo synchronization, advanced AI Travel DNA, public profiles, real-time collaboration, offline cloud editing, shareable recaps, continuous background location, geofencing, and automatic location-based itinerary changes.
