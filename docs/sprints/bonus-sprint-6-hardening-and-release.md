# Bonus Sprint 6 — Hardening and Release

[Bonus sprint index](bonus-sprints-collaboration.md) · [Previous — AI Group Proposals](bonus-sprint-5-ai-group-proposals.md)

**Goal.** Verify the entire collaboration flow and record the evidence needed to ship it.

**Prerequisite.** Acceptance for Bonus Sprints 1–5.

## Verification plan

| Area | Release evidence |
| --- | --- |
| Database | Upgrade a disposable copy of the existing schema and data. Check trip and ownership counts, foreign keys, role invariants, and fresh setup. Rehearse recovery and document which application versions can run during the rollout. |
| Permissions and privacy | Exercise Owner, Editor, Viewer, outsider, and signed-out requests. Check resource IDs from other trips, role changes and removal, revoked or replayed links, private data projection, cache clearing, and account switching during in-flight requests. |
| Concurrent writes | Run invite and edit races against PostgreSQL. Verify one successful redemption, atomic trip/version updates, and consistent outcomes when membership is removed during an edit or generation. |
| Mobile | In iOS and Android builds, test links from a cold start and while the app is open, signed-out sign-in/resume, expired invites, refresh, conflict recovery, and planner disconnect. Record build and device or simulator details. |
| Performance | Record p50 and p95 latency and error rate for trip reads and edits with concurrent accounts. Include environment, dataset size, concurrency, and sample counts. Measure planner generation separately. |
| Planner quality | Use cases with overlapping preferences, conflicting hard constraints, and incomplete place data. Record preference coverage, constraint violations in attempted drafts, route feasibility, budget deviation where measurable, generation success, and time to preview. Require zero known hard-constraint violations in drafts eligible for Apply. |

## Acceptance and handoff

- [ ] Demo the full path with independent accounts. An owner invites an editor and viewer, the editor adjusts the itinerary, the viewer refreshes to see the update, and a stale write loses without overwriting it. Generate and apply a group draft, then remove a member and demonstrate denied access.
- [ ] Record database rehearsal results, automated checks, iOS and Android evidence, observed performance and planner results, and any remaining release blockers.
- [ ] Publish a rollout and recovery checklist and a repeatable demo using disposable test accounts and trips.
