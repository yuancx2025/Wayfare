# Bonus Sprint 4 — Group Preferences

[Bonus sprint index](bonus-sprints-collaboration.md) · [Previous — Shared Editing](bonus-sprint-3-shared-itinerary-editing.md) · [Next — AI Group Proposals](bonus-sprint-5-ai-group-proposals.md)

**Goal.** Give each traveler control over what they share with the trip and its planner.

**Prerequisite.** Membership checks, removal handling, and the shared-trip screen.

## Backend and mobile scope

- Add `trip_member_preferences` keyed by `(trip_id, user_id)` with a validated preference payload and update timestamp. Scope the record to active membership and clean it up on member removal. A member of any role can submit, edit, or withdraw their own preferences.
- Separate hard constraints such as budget caps, dietary needs, and accessibility requirements from soft interests and pace. Define units and per-person versus group scope where relevant. Distinguish missing input from a member explicitly reporting no constraints.
- Show which members have shared input and which shared inputs the group and planner can use. Preview exactly what will be shared before saving. Use only opted-in, trip-scoped data for group planning. Keep existing profile preferences separate.
- Define deterministic aggregation before wiring the planner. Preserve each hard constraint, summarize soft preferences, and surface incompatible requirements for the group to resolve. Define how the planner can detect that membership or shared inputs changed since a draft was created.
- Use the [group preferences screen](https://www.figma.com/design/EyQYceyXYRnBoHiZklYW8s/Untitled?node-id=180-204) for readiness, empty, and edit states.

## Acceptance and handoff

- [ ] Three members with different roles can share distinct inputs for the same trip. Only the author can change or withdraw their entry.
- [ ] An outsider cannot read or write the trip's preferences. Other trips and private profile data stay isolated.
- [ ] Withdrawal or member removal updates readiness and excludes those inputs from the next aggregation. Test missing inputs and incompatible hard constraints.
