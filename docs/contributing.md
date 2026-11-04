# Contributing

## Where code goes

- New behavior for an existing product area goes in its `app/features/<name>/` package: routes in `router.py`,
  orchestration in `service.py`, queries in `repository.py`, tables in `models.py`, request/response models in
  `schemas.py`.
- Use another feature only through its `service.py`, `schemas.py` or `dependencies.py`. Never import another
  feature's `models.py` or `repository.py`. If you need something it doesn't expose, add a small method to its
  service.
- Pure scheduling or travel math goes in `app/domain/`. It must not import FastAPI, SQLAlchemy or providers.
- Models shared by several features or by provider protocols go in `app/contracts/travel.py`. Feature-only
  models stay in the feature's `schemas.py`.
- New external services get a protocol plus implementations under `app/integrations/`, wired in
  `app/bootstrap/providers.py`, with an offline fallback so the app still runs without credentials.
- Keep URLs, camelCase field names and `ApiRouter` (it omits null fields); the Expo app depends on them.

Example: a new "More museums" adjustment touches `features/adjustments/proposals.py` (the algorithm),
`schemas.py` (`AdjustKind`), `service.py` (dispatch in `preview`), and its tests. Nothing outside the feature.

## Databases

The API is PostgreSQL-only. SQLAlchemy models are the schema. `create_all()` creates missing tables and does not
change columns or constraints that already exist.

The API accepts only Clerk session tokens (`Authorization: Bearer`), verified locally with `CLERK_JWT_KEY`, and
scopes every trip to the signed-in account. Guests never call it; their trips stay on the device.

### Neon

Create an empty database on Neon and put its **direct** connection string (hostname without `-pooler`) in
`backend/.env`, including Neon's `sslmode=require` setting. Do not put this URL in Expo configuration.

```bash
DATABASE_URL=postgresql://...@ep-example.c-13.us-east-1.aws.neon.tech/wayfare?sslmode=require
```

Then, from `backend/`:

```bash
uv run python -m app.bootstrap.db init --seed
uv run uvicorn app.main:app --reload --port 8000
```

`init` refuses to run when application tables are already present. `--seed` inserts curated destinations.
Startup does not create tables. It inserts any catalog destinations that are still missing, and the first
request for a new user creates that user's demo trip.

To refresh the catalog without recreating tables:

```bash
uv run python -m app.bootstrap.seed
```

### Schema changes

Until Sprint 2, schema changes on the development database start from an empty database:

1. Change the model in the owning feature's `models.py`. Register a new model module in `app/db/registry.py`.
2. Create a fresh empty Neon database and point `DATABASE_URL` at its direct connection string.
3. `uv run python -m app.bootstrap.db init --seed`, then restart the API.

Creating the database and creating its tables are separate steps. There is no migration history yet.

Sprint 2 creates one fresh account database from the agreed baseline in
[the Sprint 2 account schema](sprint-2-account-schema.md). After that, schema changes to the account database are
reviewed SQL upgrade scripts checked into the repository and applied in order, so shared account data is never
reset. Alembic is not reintroduced.

### Tests

Set `TEST_DATABASE_URL` to a different PostgreSQL database whose name ends with `_test`. The suite drops and
recreates tables there and will not run if that URL is missing or targets the same database as `DATABASE_URL`,
even when credentials, driver names, or connection options differ.

```bash
TEST_DATABASE_URL=postgresql://.../wayfare_test?sslmode=require uv run pytest
```

## Validation checklist

Run these before asking for review. Every step must pass.

From `frontend/`:

```bash
npm run typecheck
npm run lint
npm test
npx expo export --platform ios --output-dir /tmp/wayfare-export-ios
npx expo export --platform android --output-dir /tmp/wayfare-export-android
```

`expo export` bundles the JavaScript for each platform without a device, so it catches import and bundling errors
that `tsc` misses.

From `backend/`, with `TEST_DATABASE_URL` set as described above:

```bash
uv run pytest
```

Then run the installed app on both platforms:

```bash
npm run ios:dev        # builds and installs on the iOS Simulator
npm run android:dev    # builds and installs on the Android emulator; needs GOOGLE_MAPS_ANDROID_KEY in .env
```

On each platform, open an existing trip and check that the map shows tiles, numbered markers, and the day's route.
Check both storage modes: leave `EXPO_PUBLIC_API_URL` unset for the offline planner, and set it to a running
backend for remote mode.

## Builds

`frontend/eas.json` defines three EAS Build profiles:

| Profile | Output |
| --- | --- |
| `development` | Development client for internal distribution |
| `ios-simulator` | Development client that installs on the iOS Simulator; no Apple Developer account needed |
| `preview-apk` | Installable Android APK for emulators and devices |

```bash
npx eas-cli@latest build --platform ios --profile ios-simulator
npx eas-cli@latest build --platform android --profile preview-apk
```

The iOS bundle identifier and Android package are both `com.yuancx2025.wayfare`.
