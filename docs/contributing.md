# Contributing to the backend

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
change columns or constraints that already exist, so a schema change starts from a new empty database.

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

1. Change the model in the owning feature's `models.py`. Register a new model module in `app/db/registry.py`.
2. Create a fresh empty Neon database and point `DATABASE_URL` at its direct connection string.
3. `uv run python -m app.bootstrap.db init --seed`, then restart the API.

Creating the database and creating its tables are separate steps. There is no migration history.

### Tests

Set `TEST_DATABASE_URL` to a different PostgreSQL database whose name ends with `_test`. The suite drops and
recreates tables there and will not run if that URL is missing or targets the same database as `DATABASE_URL`,
even when credentials, driver names, or connection options differ.

```bash
TEST_DATABASE_URL=postgresql://.../wayfare_test?sslmode=require uv run pytest
```
