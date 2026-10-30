# Wayfare backend

FastAPI service behind the Wayfare travel companion. It stores profiles and trips in PostgreSQL, discovers
places with Google Places (New), times legs with the Routes API, and plans itineraries with a LangGraph
pipeline. Google and the LLM are optional: without those keys it uses the bundled six-city catalog, distance
estimates, and the heuristic planner.

| Configured | Places | Travel times | Planner |
| --- | --- | --- | --- |
| nothing | bundled catalog | distance estimates | heuristic (same rules as the app) |
| `GOOGLE_MAPS_API_KEY` | Google Places, any city | Google Routes | heuristic |
| `+ LLM_MODEL` | Google Places | Google Routes | LLM curation, validated, with heuristic fallback; free-text Adjust Day agent |

## Run it

Requires Python 3.12 and [uv](https://docs.astral.sh/uv/).

```bash
cd backend
cp .env.example .env
# Set DATABASE_URL to the direct Neon connection string (see .env.example).
uv sync
uv run python -m app.bootstrap.db init --seed
uv run uvicorn app.main:app --reload --port 8000
```

`init` creates tables from the SQLAlchemy models in an empty database. `--seed` inserts curated destinations.
Startup does not create or alter tables. After a schema change, create a fresh Neon database, update
`DATABASE_URL`, and run `init --seed` again. `create_all()` does not update existing columns or constraints.

Then set `EXPO_PUBLIC_API_URL=http://localhost:8000` in `../frontend/.env`
(from the backend directory), and restart Expo. On the Android emulator and on physical devices the app swaps `localhost` for the
dev machine's address, so the same value works there. Interactive docs are at http://localhost:8000/docs.

See [../docs/contributing.md](../docs/contributing.md) for the Neon workflow. New to the codebase? Follow [../docs/backend-study-guide.md](../docs/backend-study-guide.md) (five staged walkthroughs with checkpoints).

## Tests

```bash
uv run pytest
```

Set `TEST_DATABASE_URL` to a PostgreSQL database whose name ends with `_test`. The suite recreates tables there
between tests and refuses to use `DATABASE_URL`. It uses fake LLMs, an `httpx.MockTransport` for Google, and fixtures exported from the
TypeScript planner, so the Python port has to produce identical days. The TypeScript planner lives in the Expo app
under `frontend/src/domain/`. After changing its `logic/` or `data/places.ts`, regenerate the fixtures
from the repo root (needs the root `pnpm install` for Vite):

```bash
node backend/scripts/export_ts_fixtures.mjs
```

`test_contract.py` also checks that the Pydantic schemas still match the interfaces in `frontend/src/domain/types.ts`.

## API

All routes except `/health` and photo redirects read the user from an `X-User-Id` header. The app generates
one per install, and without the header requests run as `demo-user`. JSON is camelCase to match `frontend/src/domain/types.ts`.

| Method | Path | Screen |
| --- | --- | --- |
| GET | `/health` | capabilities (`google`, `llm`, `agent`) |
| GET | `/me`, GET/PUT `/me/preferences` | Profile, Preferences prefill |
| GET | `/trips`, GET/DELETE `/trips/{id}` | Trips, Overview |
| POST | `/trips/generate` | Generating. Server-sent events `step` → `done` / `error`; honors `Idempotency-Key` |
| GET | `/trips/{id}/days/{n}/route` | Map polylines |
| GET | `/trips/{id}/days/{n}/activities/{aid}/alternatives` | Adjust Day → Replace |
| POST | `/trips/{id}/days/{n}/proposals` | Adjust Day preview (`relaxed`, `less-walking`, `more-food`, `replace`, `custom`) |
| POST | `/trips/{id}/proposals/{pid}/apply` | Adjust Day apply (409 if the trip changed, 410 if expired) |
| GET | `/places/autocomplete?q&session` | Create Trip destination field |
| GET | `/places/{id}?date&startMin&durationMin` | Stop details (rating, hours, open during visit) |
| GET | `/places/{id}/photo` | 302 to a Google photo URL |
| GET | `/destinations?q`, POST `/destinations/resolve`, GET `/destinations/{id}` | Explore, destination pick |

## Layout

A feature-oriented modular monolith. Module responsibilities and dependency rules are in
[../docs/architecture.md](../docs/architecture.md).

```
app/
  main.py              app factory, lifespan (catalog seed, services), CORS, error handler, /health
  core/                settings, ApiRouter (omits nulls), AppError/UpstreamError/PlanningError, id helpers
  db/                  declarative Base, async session (SessionDep), model registry for create_all
  contracts/           shared camelCase models mirroring the app's src/domain/types.ts
  domain/
    scheduler.py       deterministic scheduling, a line-for-line port of the app's src/domain/logic/generate.ts
    describe.py        plain-language preference/place text used by prompts
  integrations/
    services.py        Services container (places, router, llm, cache) and ServicesDep
    cache.py           place_cache table and TTL cache
    places/            PlaceProvider protocol; Google (New) and offline catalog providers; catalog.json
    routing/           TravelRouter protocol; Google Routes and estimate routers; resolve_legs
    llm/               init_chat_model setup
  features/
    profiles/          /me, preferences, X-User-Id identity (UserIdDep)
    trips/             /trips list/get/delete, day routes; TripService is the public trip API
    discovery/         /destinations and /places; DestinationService, PlaceService, LLM blurbs
    planning/          POST /trips/generate (SSE), PlanningService, LangGraph pipeline, LLM curation
    adjustments/       Adjust Day previews/apply, proposal store, free-text agent
  bootstrap/           builds providers from settings; database init, catalog seed, and demo user data
tests/
```

## How generation works

1. **fetch_candidates.** Gets sights for each interest and food places for each food preference near the destination.
2. **normalize.** Maps Google types to the app's categories, price levels and durations, and drops closed places.
3. **curate.** The LLM picks which candidates go on which day and in which meal slot, and writes a short "why this
   fits you" line for each (structured output that references short candidate ids). Without an LLM, the
   heuristic curator picks.
4. **validate.** Rejects unknown or duplicate places, wrong day counts, missing meals and days a place is closed.
   Problems go back to `curate` as feedback for up to `CURATE_MAX_RETRIES` attempts. After that the
   heuristic curator takes over, so generation still succeeds.
5. **schedule / legs / finalize.** Deterministic ordering, Routes API travel times, then start times.

The LLM never invents times or coordinates. It only chooses among real places, and the scheduler does the math.
