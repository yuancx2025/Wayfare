# Bonus Sprint 1 — Trip Membership and Permissions

[Bonus sprint index](bonus-sprints-collaboration.md) · [Next — Invitations and Shared Trips](bonus-sprint-2-invitations-and-shared-trips.md)

**Goal.** Preserve existing trips and make membership the source of trip access.

**Prerequisite.** Verify Clerk sessions, internal user mapping, and account switching against the target build and database. Inventory the deployed schema before preparing upgrades.

## Backend scope

- Add `trip_members` with foreign keys to trips and internal users, `role`, `joined_at`, and a unique `(trip_id, user_id)` key. Index membership lookups by user. Keep `trips.user_id` as the canonical owner and preserve its per-owner idempotency constraint.
- Use an additive SQL upgrade and a repeatable owner backfill. Stage rollout so every active trip-creation path creates an Owner membership in the same transaction before membership-only reads are enabled. Verify that each trip has exactly one Owner membership matching `trips.user_id` and that no memberships are orphaned. Include the new model in fresh database initialization.
- Extend [trip access dependencies](../../backend/app/features/trips/dependencies.py) to resolve the caller's membership and check the action centrally. Review list, detail, day route, adjustments, and delete together. Keep trip creation and idempotency lookup scoped to the creator. Return `401` without a verified session, `404` for a non-member, and `403` when a member lacks the required role.
- Define a shared-trip response with itinerary and allowed collaboration metadata. Review the existing `Trip.prefs` payload and avoid returning the owner's personal planning inputs to other members. Keep profile history, saved places, and journals on their own account-scoped paths.

## Role policy

| Action | Owner | Editor | Viewer | Starts in |
| --- | --- | --- | --- | --- |
| List and read trip, days, and map | Yes | Yes | Yes | Bonus 1; invite onboarding in Bonus 2 |
| Delete the trip | Yes | — | — | Existing owner action |
| View members | Yes | Yes | Yes | Bonus 2 |
| Invite, revoke invites, remove members, and change Editor/Viewer roles | Yes | — | — | Bonus 2 |
| Preview and apply itinerary edits | Yes | Yes | — | Bonus 3 for editors |
| Manage one's own trip preferences | Yes | Yes | Yes | Bonus 4 |
| Generate and apply a group proposal | Yes | Yes | — | Bonus 5 |

## Acceptance and handoff

- [ ] Fresh setup and upgrade of a disposable copy both succeed. Trip IDs, versions, owners, and existing itineraries match before and after the upgrade.
- [ ] A new trip and its Owner membership commit together, including generation retries with the same idempotency key.
- [ ] PostgreSQL-backed API checks cover missing sessions, outsiders, and seeded members. Owner-only actions, private profile data, and guest planning retain their expected behavior.
- [ ] A rollout checklist describes database backup, writer rollout, backfill validation, enabling the new reads, and recovery if validation fails.
