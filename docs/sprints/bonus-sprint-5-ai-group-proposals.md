# Bonus Sprint 5 — AI Group Proposals

[Bonus sprint index](bonus-sprints-collaboration.md) · [Previous — Group Preferences](bonus-sprint-4-group-preferences.md) · [Next — Hardening and Release](bonus-sprint-6-hardening-and-release.md)

**Goal.** An owner or editor generates a group itinerary draft and reviews its changes before applying it.

**Prerequisite.** Bonus 3 conflict-safe itinerary writes and Bonus 4 opted-in preference aggregation.

## Backend scope

- Feed aggregated preferences and current trip context into the [existing LangGraph planner](../../backend/app/features/planning/pipeline.py). Reuse place, routing, and scheduling integrations. Validate feasibility and hard constraints before enabling Apply. Surface incompatible requirements or insufficient data for a required constraint.
- Create `group_plan_proposals` with the trip, requesting member, base trip version, preference and membership snapshot identity, itinerary draft, validation result, and expiry. Use a generation path that saves a proposal and leaves the live itinerary unchanged. Limit proposal data to the shared itinerary and a rationale based on opted-in inputs.
- Stream progress with SSE, following the [current generation route](../../backend/app/features/planning/router.py). Define cancellation and retry behavior for a closed stream. Recheck access and input validity before storing or returning a draft after a long-running request.
- Restrict generate and apply to Owners and Editors. Apply only when the caller still has permission and the itinerary version and relevant inputs match the proposal. Write the itinerary and mark the proposal applied in one transaction. On stale inputs, require a fresh proposal. Provide expiry and discard behavior.

## Mobile scope

- Add [Generate, Proposal, and Review screens](https://www.figma.com/design/EyQYceyXYRnBoHiZklYW8s/Untitled?node-id=167-117) within the trip. Show generation progress, changes by day, group rationale, and estimated costs when supported. Provide **Apply** and **Keep Existing** actions.
- Explain that progress depends on keeping the generation screen open. Handle cancellation, provider errors, infeasible plans, expired drafts, and conflicts with actions to recover where available.

## Acceptance and handoff

- [ ] A group generates and previews a draft without changing the current itinerary. Apply commits once and the other account sees the new itinerary after refresh.
- [ ] Preview explains how the plan handles each member's shared constraints and interests. Infeasible or unverifiable hard constraints keep the draft from being applied and give the group a reason.
- [ ] A stale trip version, changed or withdrawn inputs, expired proposal, or lost edit access prevents application. Viewers and outsiders cannot generate or apply drafts.
- [ ] Disconnect, retry, and Keep Existing leave the live itinerary intact. Existing personal generation and Adjust Day still work.
