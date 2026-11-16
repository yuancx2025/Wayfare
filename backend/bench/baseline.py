"""Run the Wayfare generation endpoint against a disposable, initialized local Postgres DB.

From backend/: DATABASE_URL=postgresql://.../wayfare_bench .venv/bin/python -m bench.baseline OUTPUT.csv
Add --gemini only after confirming the configured Gemini key is free tier. Maps is always disabled.
"""

import argparse
import asyncio
import csv
import json
import logging
import os
import socket
from collections import Counter
from contextlib import asynccontextmanager
from contextvars import ContextVar
from datetime import date, timedelta
from functools import wraps
from pathlib import Path
from time import perf_counter
from unittest.mock import patch
from uuid import uuid4

import httpx
import uvicorn
from langchain_core.runnables import RunnableLambda
from sqlalchemy.engine import make_url


SCENARIOS = (
    ("nyc", 1, "culture"), ("chicago", 1, "food"), ("seattle", 1, "culture"),
    ("nyc", 3, "food"), ("san-francisco", 3, "culture"), ("new-orleans", 3, "food"),
    ("nyc", 7, "culture"), ("chicago", 7, "food"), ("san-francisco", 7, "culture"),
)
NODES = ("fetch_candidates", "normalize", "curate", "validate", "fallback", "schedule", "legs", "finalize")
RUN = ContextVar("generation_run", default=None)
FLASH_LITE = "google_genai:gemini-3.5-flash-lite"


def elapsed_ms(start):
    return (perf_counter() - start) * 1000


def timed(name, function):
    @wraps(function)
    async def run(*args, **kwargs):
        start = perf_counter()
        stats = RUN.get()
        try:
            result = await function(*args, **kwargs)
            if stats is not None and name in NODES:
                if result.get("curated_by"):
                    stats["curated_by"] = result["curated_by"]
                if name == "validate" and stats["curated_by"] == "llm":
                    stats["validations"] += 1
                    if stats["validations"] == 1 and stats["model_attempts"] == 1:
                        stats["first_pass_valid"] = not result["errors"]
                    stats["validator_rejections"] += bool(result["errors"])
            return result
        finally:
            if stats is not None:
                stats[f"{name}_ms"] += elapsed_ms(start)

    return run


class TrackRequest:
    def __init__(self, app, runs):
        self.app = app
        self.runs = runs

    async def __call__(self, scope, receive, send):
        headers = dict(scope.get("headers", []))
        key = headers.get(b"idempotency-key", b"").decode("ascii", errors="ignore")
        token = RUN.set(self.runs.get(key))
        try:
            await self.app(scope, receive, send)
        finally:
            RUN.reset(token)


class MeteredGemini:
    def __init__(self, model):
        self.model = model
        self.next_call = 0.0

    def __getattr__(self, name):
        return getattr(self.model, name)

    async def wait_for_slot(self):
        delay = self.next_call - perf_counter()
        if delay > 0:
            await asyncio.sleep(delay)

    def with_structured_output(self, schema):
        runnable = self.model.with_structured_output(schema, include_raw=True)

        async def invoke(messages):
            stats = RUN.get()
            wait_start = perf_counter()
            await self.wait_for_slot()
            stats["quota_wait_ms"] += elapsed_ms(wait_start)
            self.next_call = perf_counter() + 5
            if stats["model_attempts"] == 0:
                stats["first_pass_valid"] = False
            stats["model_attempts"] += 1
            start = perf_counter()
            try:
                response = await runnable.ainvoke(messages)
            except asyncio.CancelledError:
                stats["missing_usage"] += 1
                raise
            except Exception as error:
                stats["provider_errors"] += 1
                stats["missing_usage"] += 1
                stats["last_model_error"] = type(error).__name__
                raise
            finally:
                stats["model_ms"] += elapsed_ms(start)
            usage = response["raw"].usage_metadata
            if usage is None:
                stats["missing_usage"] += 1
            else:
                stats["input_tokens"] += usage["input_tokens"]
                stats["output_tokens"] += usage["output_tokens"]
                stats["cached_input_tokens"] += usage.get("input_token_details", {}).get("cache_read", 0)
            if response["parsing_error"] is not None:
                stats["parse_errors"] += 1
                raise response["parsing_error"]
            return response["parsed"]

        return RunnableLambda(invoke)


def draft_for(destination, days, mix, first_day):
    return {
        "destination": destination, "destinationId": destination,
        "startDate": first_day.isoformat(), "endDate": (first_day + timedelta(days=days - 1)).isoformat(),
        "travelers": 2, "prefs": {
            "pace": "balanced", "interests": ["culture", "museums", "architecture"] if mix == "culture" else ["food", "nature", "culture"],
            "food": ["local-classics", "street-food"], "transport": "transit", "budget": "moderate",
        },
    }


def score_trip(row, trip, draft):
    from app.domain.scheduler import is_open_during
    from app.integrations.places.catalog_data import catalog_places
    from app.integrations.routing.legs import MATRIX_CHUNK

    catalog = {place.id: place for place in catalog_places(draft["destinationId"])}
    leg_modes = Counter()
    for day in trip["days"]:
        slots = {activity.get("slot") for activity in day["activities"]}
        row["missing_lunch_days"] += "lunch" not in slots
        row["missing_dinner_days"] += row["mix"] == "food" and "dinner" not in slots
        for activity in day["activities"]:
            row["stops"] += 1
            place = catalog.get(activity["placeId"])
            state = is_open_during(place.hours if place else None, day["date"], activity["startMin"], activity["durationMin"])
            row["hours_known"] += state is not None
            row["closed_stops"] += state is False
            if leg := activity.get("legIn"):
                leg_modes[leg["mode"]] += 1
                row["travel_min"] += leg["minutes"]
    row["matrix_elements_if_uncached"] = sum(
        min(MATRIX_CHUNK, count - offset) ** 2
        for count in leg_modes.values() for offset in range(0, count, MATRIX_CHUNK)
    )
    row["maps_list_usd_if_uncached"] = round(0.04 * 5 + 0.005 * row["matrix_elements_if_uncached"], 6)


async def measure(client, runs, scenario, repeat, first_day, label, auth):
    destination, days, mix = scenario
    draft = draft_for(destination, days, mix, first_day)
    key = str(uuid4())
    row = {
        "mode": label, "destination": destination, "days": days, "mix": mix, "repeat": repeat,
        "outcome": "incomplete", "headers_ms": None, "first_step_ms": None, "done_ms": None,
        "first_content_ms": None, "curated_by": "", "first_pass_valid": None,
        "last_model_error": "",
        **dict.fromkeys(("validations", "validator_rejections", "model_attempts", "provider_errors",
                         "parse_errors", "missing_usage", "input_tokens", "output_tokens",
                         "cached_input_tokens", "model_ms", "quota_wait_ms", "stops", "hours_known", "closed_stops",
                         "missing_lunch_days", "missing_dinner_days", "travel_min"), 0),
        **{f"{name}_ms": 0 for name in ("prepare", *NODES, "save")},
        "matrix_elements_if_uncached": None, "maps_list_usd_if_uncached": None,
        "gemini_list_usd": None, "usage_complete": False, "persisted": None,
        "trip_id": None, "delivered_days": None,
    }
    runs[key] = row
    start = perf_counter()
    trip = None
    try:
        async with client.stream("POST", "/trips/generate", json=draft, headers={**auth, "Idempotency-Key": key}) as response:
            row["headers_ms"] = elapsed_ms(start)
            if response.status_code != 200:
                row["outcome"] = f"http_{response.status_code}"
            else:
                event = ""
                data = []
                async for line in response.aiter_lines():
                    if line.startswith("event:"):
                        event = line[6:].strip()
                    elif line.startswith("data:"):
                        data.append(line[5:].lstrip())
                    elif not line:
                        if event == "step" and row["first_step_ms"] is None:
                            row["first_step_ms"] = elapsed_ms(start)
                        elif event == "done":
                            row["done_ms"] = row["first_content_ms"] = elapsed_ms(start)
                            row["outcome"] = "delivered"
                            trip = json.loads("\n".join(data))["trip"]
                            break
                        elif event == "error":
                            row["outcome"] = "sse_error"
                            break
                        event, data = "", []
        if trip:
            row["trip_id"], row["delivered_days"] = trip["id"], len(trip["days"])
            persisted = await client.get(f"/trips/{trip['id']}", headers=auth)
            row["persisted"] = persisted.status_code == 200 and persisted.json() == trip
            score_trip(row, trip, draft)
    except httpx.HTTPError as error:
        row["outcome"] = type(error).__name__
    finally:
        runs.pop(key)
    row["usage_complete"] = row["missing_usage"] == 0
    if row["model_attempts"] > row["missing_usage"]:
        cached = row["cached_input_tokens"]
        row["gemini_list_usd"] = round(
            ((row["input_tokens"] - cached) * 0.30 + cached * 0.03 + row["output_tokens"] * 2.50) / 1_000_000, 8
        )
    return {k: round(v, 3) if k.endswith("_ms") and isinstance(v, float) else v for k, v in row.items()}


@asynccontextmanager
async def generation_server(services, runs):
    from app.features.planning import pipeline
    from app.features.planning.service import PlanningService
    from app.features.trips.service import TripService
    from app.main import create_app
    app = create_app(services)
    app.add_middleware(TrackRequest, runs=runs)
    node_wrappers = {name: timed(name, getattr(pipeline, name)) for name in NODES}
    with socket.socket() as listener, patch.multiple(pipeline, **node_wrappers), \
            patch.object(PlanningService, "prepare", timed("prepare", PlanningService.prepare)), \
            patch.object(TripService, "save_generated", timed("save", TripService.save_generated)):
        listener.bind(("127.0.0.1", 0))
        server = uvicorn.Server(uvicorn.Config(app, log_level="error", access_log=False))
        server_task = asyncio.create_task(server.serve(sockets=[listener]))
        try:
            while not server.started:
                if server_task.done():
                    server_task.result()
                    raise RuntimeError("Uvicorn failed to start")
                await asyncio.sleep(0.01)
            port = listener.getsockname()[1]
            async with httpx.AsyncClient(base_url=f"http://127.0.0.1:{port}", timeout=80, trust_env=False) as client:
                yield client
        finally:
            server.should_exit = True
            await server_task


def benchmark_settings():
    from app.core.config import get_settings
    from tests.conftest import TEST_ISSUER, TEST_JWT_KEY

    os.environ.update(CLERK_ISSUER=TEST_ISSUER, CLERK_JWT_KEY=TEST_JWT_KEY, CLERK_SECRET_KEY="", CLERK_AUTHORIZED_PARTIES="[]")
    get_settings.cache_clear()
    return get_settings()


async def warm_server(client, services, runs, first_day):
    from tests.conftest import auth_headers

    auth = auth_headers("user_wayfare_benchmark_warmup")
    (await client.get("/me", headers=auth)).raise_for_status()
    model = services.llm
    services.llm = None
    try:
        warmup = await measure(client, runs, SCENARIOS[0], 0, first_day, "warmup", auth)
        if warmup["outcome"] != "delivered" or not warmup["persisted"]:
            raise RuntimeError("Benchmark warm-up failed")
        return warmup
    finally:
        services.llm = model


async def benchmark(args):
    from app.bootstrap.providers import build_services
    from tests.conftest import auth_headers

    settings = benchmark_settings()
    if args.gemini and settings.llm_model != FLASH_LITE:
        raise SystemExit("Set LLM_MODEL to the verified free-tier Gemini 3.5 Flash-Lite model.")
    services = build_services(settings)
    if args.gemini:
        services.llm = MeteredGemini(services.llm)
    runs = {}
    first_day = date.fromisoformat(args.start_date)
    async with generation_server(services, runs) as client:
        warmup = await warm_server(client, services, runs, first_day)
        label = "gemini" if args.gemini else "heuristic"
        with Path(args.output).open("x", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=warmup.keys())
            writer.writeheader()
            for repeat in range(1, args.repeats + 1):
                for scenario in SCENARIOS[:1] if args.pilot else SCENARIOS:
                    if args.gemini:
                        await services.llm.wait_for_slot()
                    auth = auth_headers("user_wayfare_benchmark", expires_in=300)
                    row = await measure(client, runs, scenario, repeat, first_day, label, auth)
                    writer.writerow(row)
                    stream.flush()
                    print(label, scenario, repeat, row["outcome"], row["curated_by"],
                          row["done_ms"], "ms", row["model_attempts"], "model attempts",
                          row["last_model_error"], flush=True)
                    if args.gemini and row["provider_errors"]:
                        raise RuntimeError("Live provider error. Stopped further calls and retained the partial CSV.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output")
    parser.add_argument("--start-date", default="2026-12-07")
    parser.add_argument("--repeats", type=int, choices=(1, 2, 3), default=3)
    parser.add_argument("--gemini", action="store_true")
    parser.add_argument("--pilot", action="store_true")
    args = parser.parse_args()
    database = make_url(os.environ["DATABASE_URL"])
    if database.host != "127.0.0.1" or not (database.database or "").endswith("_bench") or database.query:
        raise SystemExit("Use a disposable loopback database whose name ends in _bench.")
    os.environ.update(GOOGLE_MAPS_API_KEY="", GOOGLE_GENAI_USE_VERTEXAI="false")
    if not args.gemini:
        os.environ.update(LLM_MODEL="", GOOGLE_API_KEY="")
    logging.disable(logging.WARNING)  # Keep upstream error bodies and model output out of benchmark logs.
    asyncio.run(benchmark(args))


if __name__ == "__main__":
    main()
