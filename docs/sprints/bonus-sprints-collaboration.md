# Wayfare — Collaboration Bonus Sprints

[Classroom roadmap](../wayfare-v2-roadmap.md) · [Figma collaboration exploration](https://www.figma.com/design/EyQYceyXYRnBoHiZklYW8s/Untitled?node-id=167-117)

**Status.** Post-course implementation plan. Schedule and owners can be set after the classroom release. The sprint numbers below are relative to this track.

## Milestones

| Bonus sprint | Exit milestone | Suggested PRs |
| --- | --- | --- |
| [1 — Trip membership and permissions](bonus-sprint-1-trip-membership-and-permissions.md) | Existing trips retain their owners and membership-based access is verified. | Schema and backfill, then trip authorization |
| [2 — Invitations and shared trips](bonus-sprint-2-invitations-and-shared-trips.md) | **Shareable-trip MVP.** A second account accepts an invitation and opens the trip. | Invitation and member APIs, then mobile flow |
| [3 — Shared itinerary editing](bonus-sprint-3-shared-itinerary-editing.md) | **Collaborative itinerary MVP.** An editor changes a day and a competing stale write returns `409`. | Transaction and role checks, then conflict and refresh UX |
| [4 — Group preferences](bonus-sprint-4-group-preferences.md) | Members can share, update, and withdraw preferences for one trip. | Preference API and screen |
| [5 — AI group proposals](bonus-sprint-5-ai-group-proposals.md) | **AI-assisted group planning.** An editor generates, reviews, and explicitly applies a draft. | Planner and proposal APIs, then mobile review flow |
| [6 — Hardening and release](bonus-sprint-6-hardening-and-release.md) | A rehearsed upgrade and repeatable cross-platform demo support release. | Release checks and verification record |

## Decisions across the track

- Clerk verifies identity. Wayfare authorizes each trip action using its PostgreSQL membership records. Local guests can keep planning offline. Sharing requires a signed-in account and a cloud trip. Any guest import is an explicit, separate action.
- Reuse Trips, Explore, and Profile. Put invitations, members, editing, and AI planning inside the trip flow. Keep Saved Places personal and reuse the collections feature when integrating Profile navigation.
- Use authenticated HTTP for shared reads and writes. Refresh when opening a shared trip, when returning to the screen, after a successful mutation, and on demand. Use the existing server-sent event (SSE) pattern for planner progress.
- Ship additive, reviewed SQL upgrades under the [repo's schema policy](../contributing.md#schema-changes). Each sprint includes targeted verification before handoff. Bonus 6 repeats the full flow together.

**Follow-up backlog.** Activity comments, suggestions and voting, live presence, offline shared edits, background generation, and ownership transfer.
