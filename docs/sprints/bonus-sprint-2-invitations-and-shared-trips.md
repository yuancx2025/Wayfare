# Bonus Sprint 2 — Invitations and Shared Trips

[Bonus sprint index](bonus-sprints-collaboration.md) · [Previous — Trip Membership](bonus-sprint-1-trip-membership-and-permissions.md) · [Next — Shared Editing](bonus-sprint-3-shared-itinerary-editing.md)

**Goal.** An owner invites a friend, who can sign in and open the trip with the assigned role.

**Prerequisite.** Bonus 1 access checks and verified owner backfill.

## Backend scope

- Add `trip_invitations` with the trip, issuer, token hash, Editor or Viewer role, expiry, revocation, and redemption state. Generate a random token for the link and keep it out of logs and analytics. Only an Owner can issue or revoke an invite.
- Start with expiring, single-use links redeemable by the first eligible signed-in account. Give the signed-out screen a generic prompt. Show only the details needed to confirm the trip and role after sign-in and token validation. Acceptance is the step that grants access.
- Validate and redeem in one transaction with the membership insert. Concurrent claims by different accounts have one winner. A retry by the winning account can return its existing membership. Replays must never restore a removed membership or change an existing member's role.
- Add trip-scoped members and invite actions. Show only the display name and role needed for the roster. Owners can change Editor/Viewer roles and remove members. Revoking an invite closes the link; removing a member ends access that was already granted.

## Mobile scope

- Use the existing app links and sign-in flow to resume a pending invite after authentication. Clear pending invite data after completion or cancellation and when switching away from the account handling it. Test installed builds before choosing the public link format and install fallback.
- Build the Trips shared state, trip overview, Invite, Join, and Members screens using [Figma screens 01–05](https://www.figma.com/design/EyQYceyXYRnBoHiZklYW8s/Untitled?node-id=167-117). Show the trip once per user and keep management actions role-aware.
- Reconcile navigation with the [draft collections PR](https://github.com/yuancx2025/Wayfare/pull/8) if it lands first. Reuse its Saved Places flow under Profile in the three-tab layout.
- Fetch shared trips for the active account. On a denied refresh, remove the shared trip and its cached details from the UI. Keep shared trip data out of guest and offline storage.

## Acceptance and handoff

- [ ] A signed-out invitee opens the link, signs in, resumes the invite, and finds the trip in Trips. The flow is checked in iOS and Android builds.
- [ ] Expired, revoked, and invalid links fail safely. Concurrent acceptance and retries preserve one membership, and a different account cannot redeem a used link. The invite cannot grant Owner access or expose another trip.
- [ ] Changing a role takes effect on the next authorized operation. Removing the member denies subsequent reads and clears the shared trip from the app when it next checks access.
- [ ] A guest can keep using local planning without uploading or exposing existing trips when signing in to accept a link.
