# Neon migration validation — October 11, 2026

The backend follows the attached PostgreSQL-only initialization plan. The iOS planning flow works against Neon. Android generation and editing work against Neon, but Android map rendering in the installed Expo Go client fails SDK authorization. Concurrent proposal application also has a reproduced, existing race.

## Plan comparison

| Requirement | Verification |
| --- | --- |
| PostgreSQL DATABASE_URL required; SQLite rejected | Settings and URL validation tests |
| Async psycopg engine; no SQLite hooks | Source inspected; both configured Neon connections succeeded |
| JSONB and timezone-aware timestamps | All five tables inspected in wayfare and wayfare_test; round-trip tests passed |
| Models and registry define the schema | Registry imports all five models; Alembic configuration and migrations removed |
| Explicit init, optional seed, refusal on existing tables | Tests cover seeded/unseeded init, repeat init, and a partially initialized database |
| Startup does not create tables | Regression test verifies startup fails against an empty database without creating tables |
| Separate disposable test database | wayfare and wayfare_test use direct SSL connections; table resets target only the test database |
| Trip persistence across restart | Automated lifespan restart and a fresh API process both retrieved saved trips |
| PostgreSQL-only documentation | Remaining SQLite descriptions and frontend environment setup path corrected |

The test reset guard now compares database identity instead of literal connection strings. Driver aliases, different credentials, explicit default ports, encoded database names, and Neon pooled-host aliases cannot bypass the development-database check. Connection-target query overrides are rejected.

## Added coverage and fixes

- Database safety: missing/invalid test URL, aliases of the development database, connection overrides, and a valid separate test database.
- Initialization: SSL options, accepted/rejected schemes, optional seeding, partial schema refusal, and no startup DDL.
- Persistence: saved trips across a new API lifespan, JSONB/timezone values, cache expiration, and proposal expiration returning 410 without changing the trip.
- Remote frontend: stable anonymous identity, progress streaming, cancellation and retry headers, incomplete/error streams, proposal 409/410 handling, and place-detail provider failures.
- Streaming fix: normalize CRLF after accumulating chunks so a split delimiter cannot combine two events and break JSON parsing.
- Date-picker fixes: iOS Done commits the displayed date; native pickers use the supported onValueChange/onDismiss handlers. [Date-picker API](https://github.com/react-native-datetimepicker/datetimepicker#onvaluechange-optional).

Backend validation: 69 passing tests plus one known expected-failure concurrency regression. Frontend validation: 25 passing tests and TypeScript checks. Both native production bundles exported. Configured backend keys were absent from the exports.

Lint was attempted. The checkout lacks ESLint configuration/dependencies; automatic installation was stopped and its package changes reverted. Lint success is not claimed.

## Live credentials and device integration

| Component | Result |
| --- | --- |
| Neon development and test connections | Passed; five tables, JSONB, timestamptz, and cascading foreign keys inspected |
| Google Places backend key | Passed: autocomplete, destination resolution, candidate search, details, photos, and nearby search with PostgreSQL cache |
| Google Routes backend key | Passed: matrices and polylines for walking, driving, and transit |
| Gemini backend key | Passed with google_genai:gemini-3.5-flash-lite: real structured output and tool calls |
| Frontend backend connection | Passed in both running Expo Go clients |
| iOS map | Passed: Apple Maps rendering with Google route lines |
| Android map in Expo Go | Failed: blank map; SDK authorization error for Expo Go's embedded key |
| Configured Android SDK key | Not verified in a signed build; the failed runtime key differs from the configured key |
| Google Maps SDK on iOS | Not configured; iOS currently uses Apple Maps |

### Follow-up: Neon identity and both live agent engines

The configured development endpoint is `ep-little-wind-b7t18ube.c-13.us-east-1.aws.neon.tech`, database `wayfare`, PostgreSQL role `wayfare_owner`. A fresh read-only SQL connection confirmed the database and role on PostgreSQL 17.11. The hostname identifies AWS us-east-1. Application database access uses the connection-string password over SSL, not Neon account OAuth. The connection string does not identify the owning Neon account email, organization, or branch name.

A fresh live engine check used the existing `wayfare_test` database for provider caching, without resetting tables or saving a trip:

- The actual planning StateGraph completed fetch_candidates → normalize → curate → validate → schedule → legs → finalize. Its recorded curation source was `llm`; no heuristic fallback occurred. It produced a three-stop Chicago day using the configured Gemini model and real Google providers.
- The actual free-text adjustment agent executed `view_day`, `search_places`, and `insert_activity`, returning a coffee-break preview with two change entries. The original itinerary remained unchanged. This verifies the full tool-execution loop, beyond the earlier isolated Gemini tool-call capability check.

Both engines share the backend Gemini key and configured chat model. Google Places/Routes use the separate backend Maps Platform key. LangGraph itself needs no provider API key; there is no Neon OAuth dependency in either engine. These successful live examples complement mocked retry/fallback tests; they do not establish every possible agent request succeeds.

Devices: iPhone 18 Pro simulator on iOS 27.0 and Pixel 10 emulator on Android 17, both using Expo Go with SDK 57.

### iOS flow

Loaded a saved Neon trip, viewed route lines, and generated a one-day Chicago trip through the actual date/preferences screens. Requested “Add a coffee break near lunch.” Gemini added Starbucks Reserve Roastery in a preview. Before Apply, Neon still held version 1 with three stops and a separate proposal. Apply saved version 2 with four stops. Live ratings and opening hours loaded. A separate API process retrieved exactly the saved adjusted trip.

### Android flow

Loaded a saved trip, selected Chicago and dates, changed pace/transport, and generated a one-day trip. The itinerary received Google travel times. The More food preview added a fourth stop; Apply updated the displayed itinerary. After a cold app restart and reopening the recent Expo project, the adjusted four-stop trip still appeared. Neon separately confirmed both native test trips at version 2 with four stops. Map navigation and stop controls loaded, but the map surface remained blank due to the installed Expo Go SDK key's authorization failure. Android map rendering has not passed.

## Remaining issues

1. **Concurrent Apply:** tests/test_concurrency.py synchronizes two real PostgreSQL writes after both rows are read. Both requests return 200 where one should return 409. Its expected-failure marker covers only this demonstrated race; setup/network failures remain real failures. Atomic version comparison and update remains a separate correctness change.
2. **Android SDK validation:** configure the native app's package identifier and supply its signing SHA-1 matching the key restrictions. Enable Maps SDK for Android and build with the configured key. Expo Go does not exercise that key; its current embedded key fails authorization. [Expo Maps setup](https://docs.expo.dev/versions/v57.0.0/sdk/map-view/).
3. **Google Maps on iOS:** requires its own SDK key, bundle identifier, Google provider configuration, and rebuilt app if desired.
4. These are simulator/emulator smoke tests, not physical-device, signed-release, load, or complete UI acceptance tests. Successful key requests do not prove free-tier billing.

## Reproduce

From backend, run `uv run pytest -q -rx`. Tests recreate tables only in the configured wayfare_test database.

Run the API from backend with `uv run uvicorn app.main:app --host 127.0.0.1 --port 8000` for local simulator/emulator checks. The development database must already be initialized.

From frontend:

```bash
npm run typecheck
npm test -- --runInBand --watchman=false
NODE_OPTIONS=--dns-result-order=ipv4first npm start -- --localhost --ios --android
```

The IPv4 option avoids Metro listening only on ::1 while advertising 127.0.0.1. Android can open exp://10.0.2.2:8081; the frontend resolves its localhost API URL to the emulator's host alias. The iOS simulator uses localhost.
