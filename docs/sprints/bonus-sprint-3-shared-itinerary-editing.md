# Bonus Sprint 3 — Shared Itinerary Editing

[Bonus sprint index](bonus-sprints-collaboration.md) · [Previous — Invitations](bonus-sprint-2-invitations-and-shared-trips.md) · [Next — Group Preferences](bonus-sprint-4-group-preferences.md)

**Goal.** Owners and editors can adjust a shared itinerary and recover cleanly from a competing edit.

**Prerequisite.** Bonus 2 invitations, member roles, and shared-trip reads.

## Backend scope

- Extend the existing Adjust Day preview and apply routes to editors. Check access on both paths. A preview includes its base trip version and leaves the itinerary unchanged. Viewers can open the itinerary and its map.
- Reuse [the conditional version update](../../backend/app/features/trips/repository.py) and [transactional proposal apply](../../backend/app/features/adjustments/service.py). Coordinate membership changes and itinerary writes so the write transaction verifies current edit access. Update the itinerary, increment the version, and consume the proposal together.
- Return `409` for stale proposals when the caller still has edit access. Treat a retry of an applied proposal as already handled without a second write. Exercise role changes and removals during in-flight writes in addition to competing edits.

## Mobile scope

- Reuse Adjust Day and show the preview before applying. When apply conflicts, reload the itinerary and offer to regenerate the preview from the latest trip. Keep the winning version visible.
- Refresh shared trip summaries and details on screen return, on demand, and after successful mutations. Discard late responses after an account change or after the app detects lost trip access. Refresh role-dependent controls when membership changes.
- Use the day-plan layout in the [Figma exploration](https://www.figma.com/design/EyQYceyXYRnBoHiZklYW8s/Untitled?node-id=167-132). Track comments and voting separately from editing acceptance.

## Acceptance and handoff

- [ ] An invited editor adjusts a day and the owner sees the result after refresh. A viewer can read the new itinerary and receives `403` when attempting an edit.
- [ ] Extend the [existing concurrency tests](../../backend/tests/test_concurrency.py) to two accounts. Two proposals based on the same version result in one successful apply, one `409`, and one version increment.
- [ ] Replaying apply, revoking access mid-flow, and switching accounts during a fetch preserve correct access and itinerary state.
- [ ] The existing personal Adjust Day and local guest flows pass regression checks.
