# Sprint 2 — Authentication and Private Accounts

[Overall roadmap](../wayfare-v2-roadmap.md) · [Previous: Profile and History](sprint-1-profile-and-history.md) · [Next: Collections and Memories](sprint-3-collections-and-travel-memories.md)

**Dates:** October 26–November 1, 2026.

**Priority:** P0; critical path.

**Goal:** Replace trusted installation IDs with verified accounts while keeping a usable local guest experience.

This is a planning document. Depends on Sprint 1's profile/API contracts, concurrency correction, and agreed V2 schema. Shared capacity and delivery rules are defined in the overall roadmap.

## Committed implementation

### Account experience — Frontend owner

- Integrate Clerk with SecureStore-backed session caching.
- Implement email/password registration, email verification, sign-in, recovery, sign-out, and session restoration.
- Offer "Continue as guest" alongside account entry.
- Add account controls to Profile and clearly identify guest/local data.
- Explain that existing guest trips remain local until an import feature is available.

Use Clerk's Expo integration for account and session handling. See [Clerk Expo setup](https://clerk.com/docs/expo/getting-started/quickstart).

### Trusted backend identity — Backend owner

- Verify Clerk bearer sessions using the official Python SDK.
- Pin the expected issuer, validate signature and expiry, and configure the agreed API audience. Apply allowed-origin constraints to web sessions.
- Map the verified Clerk identity uniquely to an internal Wayfare user.
- Provision profiles safely when several first requests arrive together.
- Replace `X-User-Id` and the `demo-user` fallback for private API access.
- Require verified sessions for profiles, trips, planning, adjustments, and live discovery; retain the public health/photo exceptions.
- Preserve per-user idempotency and return `404` for another user's trip or proposal.

### Account-aware frontend state — Frontend and Integration/QA owners

- Replace the global API singleton with a provider selecting the local guest adapter or authenticated remote adapter.
- Obtain current tokens for ordinary requests and SSE generation.
- On account changes, abort requests/streams, discard late responses, and reset stores, drafts, selected trips, proposals, and query caches.
- Refresh account data on foreground return and explicit refresh.
- Keep signed-in cloud operation dependent on connectivity; do not silently redirect failed cloud writes into guest storage.

Extend the existing [API contract and adapters](../../frontend/src/lib/api/types.ts).

### Database and hosting — Backend and Integration/QA owners

- Initialize a separate Neon account database and preserve the existing demo database.
- Include identity mapping, deletion-state support, trip favorite/visited fields, saved-place storage, and journal storage in the V2 baseline.
- Disable automatic sample-trip creation for real accounts.
- Deploy the authenticated API to free Render and exercise it from both simulators.
- Keep database, Clerk, Google, and Gemini secrets on the backend.

## Weekly execution

| Period | Work |
| --- | --- |
| Early week | Configure Clerk and the database baseline; agree on guest/account transition behavior. |
| Midweek | Complete server verification, account screens, token-bearing requests, and state isolation. |
| End of week | Connect the hosted backend and run the two-account security demonstration. |

## Acceptance and handoff

- [ ] Registration, verification, recovery, sign-out, and restart restoration work.
- [ ] Invalid, expired, and missing tokens receive `401`.
- [ ] Account A cannot list, read, modify, delete, or apply proposals to Account B's data.
- [ ] One account sees its cloud trips from separate iOS/Android installations.
- [ ] Switching accounts during loading or generation reveals no previous-account data.
- [ ] Guest planning works without Clerk or backend connectivity.
- [ ] Authenticated generation retains progress, cancellation, retry, and idempotency behavior.

**Deliverable:** Verified private accounts, local guest mode, and a remotely accessible authenticated backend.

**P1:** Google login and validated guest-trip import. Apple sign-in remains deferred while Apple signing access is unavailable.
