# Wayfare — Travel Companion

A travel planner built with Expo, React Native, and Expo Router. Create trips, choose preferences, generate daily itineraries, view routes, and adjust activities. The app includes an offline planner and can connect to an optional FastAPI + LangGraph backend.

## Demo

![App demo — full walkthrough, approximately 98 seconds](demo-preview.gif)

The full walkthrough above loops automatically without audio. [Watch or download the MP4 with audio](demo.mp4).

For the hook inventory, usage, and custom-hook benefits, see [the hooks guide](docs/HOOKS.md).

## First-time setup: choose what you need

Start with the offline app, then add services as needed. Installing the frontend does not require any API keys.

| Setup | Credentials needed | What you get |
| --- | --- | --- |
| Offline frontend | None | Bundled destinations, local trip storage, heuristic planning |
| Frontend + backend | PostgreSQL connection string | Server-side trip/profile storage, bundled catalog and heuristic planning |
| Backend + Google Maps | Separate Maps Platform server key | Live place search/details/photos and route estimates |
| Backend + Gemini | Separate Gemini Developer API key and model setting | LLM curation and free-text adjustments when supported |
| Your own Android native map build | Separate Android Maps SDK key | Google map display in the Android build |

Google Maps and Gemini are independently optional. The current backend requires PostgreSQL even when both provider keys are blank. A Neon MCP connection is not required to run the app.

Install [Git](https://git-scm.com/downloads) and [Node.js 22](https://nodejs.org/en/download) (which includes npm). Backend development also requires [Python 3.12+](https://www.python.org/downloads/) and [uv](https://docs.astral.sh/uv/getting-started/installation/). pnpm is only needed for the fixture-export tooling described below.

```bash
git clone https://github.com/yuancx2025/Wayfare.git
cd Wayfare
```

## Start the app without keys

Run these commands from the repository root. Use Node.js 22 (the version specified in `.mise.toml`) and npm.

```bash
cd frontend
npm ci
npm start
```

For a fresh clone, do not create a frontend environment file yet. If you already copied `frontend/.env.example`, clear `EXPO_PUBLIC_API_URL` in your frontend environment files and restart Expo to select offline mode. The example defaults to a backend URL, so copying it unchanged expects a running backend.

Use the Expo terminal menu to open the app on a supported device or simulator. An iOS simulator requires Xcode on macOS; an Android emulator requires Android Studio and a configured emulator.

You can also start a specific target directly from the repository root:

```bash
# Browser
npm --prefix frontend run web

# iOS simulator
npm --prefix frontend run ios

# Android emulator
npm --prefix frontend run android
```

No API keys or backend are required for the offline planner. Leave `EXPO_PUBLIC_API_URL` unset to use it.

## Run with the backend

### Obtain a PostgreSQL connection string

1. Sign up at [Neon](https://console.neon.tech/) and create a development project. Use your own empty development database, or ask the project owner for access to a dedicated development branch/database.
2. In the project's **Connect** dialog, select the intended branch, database, and role. Turn connection pooling off and copy the direct PostgreSQL connection string. Follow [Neon's connection guide](https://neon.com/docs/connect/connect-from-any-app).
3. Copy `backend/.env.example` to `backend/.env` and replace its example `DATABASE_URL` with that string. Keep `sslmode=require`; follow this repo's direct-connection convention (hostname without `-pooler`).
4. Leave Maps/Gemini keys and `LLM_MODEL` blank for the first backend run. `TEST_DATABASE_URL` is only needed for tests, not normal startup.

The connection string contains the database password. It is a backend secret, not a Neon API key or a frontend setting.

### Initialize and start the server

In a terminal at the repository root:

```bash
cd backend
# With .env configured using the steps above:
uv sync
uv run python -m app.bootstrap.db init --seed
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API uses PostgreSQL. Run `init --seed` once for an empty database; it creates tables and curated destinations. For subsequent starts, run only the Uvicorn command. Initialization refuses an existing application schema; if using a teammate's already initialized development database, skip initialization. It does not migrate existing tables. See [the contributing guide](docs/contributing.md) for the current schema-change workflow.

API documentation is available at <http://localhost:8000/docs>.

Create `frontend/.env.local` with:

```dotenv
EXPO_PUBLIC_API_URL=http://localhost:8000
```

Then start or restart Expo in a second terminal, from the repository root:

```bash
npm --prefix frontend start
```

On native devices, the app rewrites `localhost` to the development machine's address from Metro, with an Android emulator fallback of `10.0.2.2`. For a physical device, keep the phone and development machine on the same network and allow access to port 8000. If automatic detection does not work, set the API URL to your computer's reachable LAN address.

The backend also works without Google or LLM keys, using its bundled catalog and heuristic planner. To enable Google Places/Routes or an LLM, edit your existing `backend/.env` using the steps below. See [the backend README](backend/README.md) for providers, database setup, and API details. Keep provider secrets and `DATABASE_URL` in the backend environment; `EXPO_PUBLIC_*` values are exposed to the client.

## Obtain optional API keys

### Google Maps Platform: backend places and routes

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create/select a project.
2. Link a billing account and enable **Places API (New)** and **Routes API** in that project. Google requires billing for these services; review pricing and quotas before use.
3. Under **APIs & Services → Credentials**, create an API key.
4. Restrict that server key to Places API (New) and Routes API. Use an IP-address application restriction for the backend's public outbound IP where practical; a browser-referrer or Android restriction is inappropriate for this server key.
5. Set `GOOGLE_MAPS_API_KEY` in `backend/.env`, then restart the backend.

```dotenv
# backend/.env
GOOGLE_MAPS_API_KEY=your_maps_server_key
```

This enables backend place discovery and route calculations; it does not configure Android map display. Official instructions: [Places setup](https://developers.google.com/maps/documentation/places/web-service/get-api-key), [Routes setup](https://developers.google.com/maps/documentation/routes/get-api-key), and [key restrictions](https://developers.google.com/maps/api-security-best-practices).

### Gemini Developer API: LLM planning

1. Sign in to [Google AI Studio's API keys page](https://aistudio.google.com/api-keys), accept the applicable terms, and create a key for an available project.
2. Check model availability, quota, and billing for that project. Free-tier eligibility and limits vary; do not assume that creating a key guarantees access to every model.
3. Set the following values in `backend/.env`, replacing the placeholder key, then restart the backend:

```dotenv
# backend/.env — matches the repository's Gemini example
GOOGLE_API_KEY=your_gemini_key
LLM_MODEL=google_genai:gemini-3.5-flash-lite
LLM_TEMPERATURE=1.0
GOOGLE_GENAI_USE_VERTEXAI=false
```

Both the key and `LLM_MODEL` are needed to enable the LLM. `GOOGLE_API_KEY` is the Gemini key; `GOOGLE_MAPS_API_KEY` is the separate Maps Platform server key. Do not swap them. This setup uses the Gemini Developer API, not Vertex AI.

Official instructions: [Gemini keys](https://ai.google.dev/gemini-api/docs/api-key), [models](https://ai.google.dev/gemini-api/docs/models), and [billing](https://ai.google.dev/gemini-api/docs/billing). If the example model is unavailable to your project, choose an accessible text model with structured-output/tool support and keep the `google_genai:` prefix. Backend configuration enables the integration; a successful generated trip is the end-to-end check.

### Android map display: only for your own native build

The browser uses a map fallback and needs no Maps JavaScript API key. iOS uses Apple Maps. For Google map display in your own Android build:

1. Enable **Maps SDK for Android** and billing in Google Cloud.
2. Create a separate key with an **Android apps** restriction using your build's actual application/package ID and signing certificate SHA-1. Restrict it to Maps SDK for Android.
3. Set `GOOGLE_MAPS_ANDROID_KEY` in `frontend/.env.local`, then rebuild the Android app. Restarting Expo alone does not update an embedded native key.

```dotenv
# frontend/.env.local
EXPO_PUBLIC_API_URL=http://localhost:8000
GOOGLE_MAPS_ANDROID_KEY=your_android_map_display_key
```

This key is embedded in the Android build, so its Android/API restrictions matter. Never use the backend server key here. Follow [Google's Android SDK setup guide](https://developers.google.com/maps/documentation/android-sdk/get-api-key).

## Verify setup and troubleshoot

With the backend running:

```bash
curl http://localhost:8000/health
```

The response includes `google`, `llm`, and `agent` capabilities. Without provider keys they should be false. Configuring Maps should enable `google`; configuring an LLM should enable `llm`, with `agent` depending on tool support. This endpoint reports configured capabilities, not a live credential/billing test. Generate a trip and inspect place/route behavior to exercise provider calls.

| Symptom | Check |
| --- | --- |
| Frontend cannot reach the API | Backend is running; frontend API URL is correct; restart Expo after environment changes |
| Phone cannot reach the API | Same network, backend bound to `0.0.0.0`, port 8000 reachable; use computer's LAN IP if needed |
| Database connection fails | Replace the example URL; check database/role/password, SSL, and direct connection selection |
| Database initialization says tables exist | Skip initialization for an already initialized database; do not treat `init` as an upgrade command |
| Google requests fail | Correct server key, both APIs enabled, billing active, quotas and IP/API restrictions correct |
| Gemini is unavailable | Correct Gemini key/model, project access/quota/billing, backend restarted; check backend logs for fallback/errors |
| Android map display fails | Separate SDK key, SDK enabled, matching package/SHA-1 restrictions, rebuilt native app |

Keep backend credentials in `backend/.env` and only public frontend settings in `frontend/.env.local`. These files are ignored by Git; commit `.env.example` templates with placeholders. Each teammate should use their own development credentials or receive team access through the provider. Do not paste keys or database passwords into Git, issues, or screenshots.

## Repository layout

| Path | Purpose |
| --- | --- |
| `frontend/app/` | Expo Router screens and navigation |
| `frontend/src/components/` | Shared UI and map components |
| `frontend/src/domain/` | Planner logic, bundled places, types, and schemas |
| `frontend/src/lib/api/` | Local planner and remote backend adapters |
| `frontend/src/state/` | App state and trip session state |
| `backend/` | FastAPI service, LangGraph planner, database, and tests |
| `package.json`, `pnpm-lock.yaml` | Tooling for regenerating backend planner fixtures |

## Checks

From the repository root, after installing the Expo dependencies:

```bash
npm --prefix frontend run typecheck
npm --prefix frontend test -- --runInBand
```

For backend tests:

```bash
cd backend
uv sync
# TEST_DATABASE_URL must name a PostgreSQL database ending in _test.
uv run pytest
```

## Regenerate planner fixtures

The root package only supplies Vite for loading the frontend TypeScript planner into the backend fixture exporter. It does not run a separate frontend. From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm run fixtures
```

The exporter refreshes the backend catalog and planner parity fixtures from `frontend/src/domain/`.
