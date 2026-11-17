"""Measure Day 1 lead time within a Gemini structured-output stream.

Run from backend/ with a verified free-tier Gemini 3.5 Flash-Lite key.
The probe uses bundled places and synthetic candidates. It makes no Maps or database calls.
"""

import argparse
import asyncio
import csv
import json
import os
import re
import warnings
from datetime import date, timedelta
from pathlib import Path
from time import perf_counter

from app.core.config import get_settings
from app.features.planning.curation import DayChoice, TripPlanChoice, curate_messages, validate_choice
from app.features.planning.pipeline import normalize
from app.features.planning.schemas import TripDraft
from app.integrations.llm.client import get_chat_model
from app.integrations.places.catalog_data import catalog_destinations, catalog_places
from bench.baseline import FLASH_LITE, draft_for

CASES = (("nyc", 3, False), ("san-francisco", 3, False), ("nyc", 7, False), ("san-francisco", 7, True))
DAYS_ARRAY = re.compile(r'\s*\{\s*"days"\s*:\s*\[\s*')
DECODER = json.JSONDecoder()


def first_day(text):
    start = DAYS_ARRAY.match(text)
    if start is None:
        return None
    try:
        value, _ = DECODER.raw_decode(text, start.end())
    except json.JSONDecodeError:
        return None
    return DayChoice.model_validate(value)


def add_synthetic_places(places):
    sights = [p for p in places if p.category != "food"]
    restaurants = [p for p in places if p.category == "food"]
    for label, templates, count in (("Sight", sights, 15), ("Restaurant", restaurants, 11)):
        for i in range(count):
            p = templates[i % len(templates)]
            places.append(p.model_copy(update={
                "id": f"synthetic-{label.lower()}-{i + 1}",
                "name": f"Benchmark {label} {i + 1}",
                "lat": p.lat + (i + 1) * 0.00015,
            }))
    return places


async def probe(model, case, repeat, start_date, mode, timeout):
    city, days, synthetic = case
    destination = next(d for d in catalog_destinations() if d.id == city)
    draft = TripDraft.model_validate(draft_for(city, days, "culture", start_date))
    dates = [(start_date + timedelta(days=i)).isoformat() for i in range(days)]
    places = list(catalog_places(city))
    if synthetic:
        add_synthetic_places(places)
    aliases = (await normalize({"candidates": places, "draft": draft}, {}))["aliases"]
    messages = curate_messages(destination, draft.prefs, dates, draft.travelers, aliases)
    text = ""
    day, local_valid, first_ms, full_ms = None, False, None, None
    first_chunk_ms, chunks = None, 0
    started = perf_counter()
    async def responses():
        if mode == "blocking":
            yield await model.ainvoke(messages)
        else:
            async for message in model.astream(messages):
                yield message

    outcome = "response"
    try:
        async with asyncio.timeout(timeout):
            async for chunk in responses():
                if not chunk.text:
                    continue
                now = (perf_counter() - started) * 1000
                chunks += 1
                if first_chunk_ms is None:
                    first_chunk_ms = now
                text += chunk.text
                if day is None:
                    day = first_day(text)
                    if day is not None:
                        first_ms = now
                        errors, _ = validate_choice(TripPlanChoice(days=[day]), aliases, dates, draft.prefs)
                        local_valid = bool(day.stops) and not any(e.startswith("Day 1:") for e in errors)
                if full_ms is None:
                    try:
                        value, end = DECODER.raw_decode(text.lstrip())
                        if isinstance(value, dict) and end == len(text.strip()):
                            full_ms = now
                    except json.JSONDecodeError:
                        pass
    except TimeoutError:
        outcome = "timeout"
    except Exception as error:
        cause = error.__cause__
        code = getattr(cause, "code", None) or getattr(error, "status_code", None)
        outcome = f"http_{code}" if code else type(error).__name__
    end_ms = (perf_counter() - started) * 1000
    full, errors = None, None
    if outcome == "response":
        try:
            full = TripPlanChoice.model_validate_json(text)
            errors, _ = validate_choice(full, aliases, dates, draft.prefs)
        except ValueError:
            outcome = "invalid_schema"
    usable = mode == "stream" and local_valid and errors == [] and full.days[0] == day
    lead = full_ms - first_ms if usable and full_ms is not None else None
    row = {
        "city": city, "days": days, "synthetic_candidates": synthetic, "repeat": repeat,
        "mode": mode, "outcome": outcome,
        "chunks": chunks, "first_chunk_ms": first_chunk_ms, "first_complete_day_ms": first_ms,
        "full_json_ms": full_ms, "stream_end_ms": end_ms, "day_one_locally_valid": local_valid,
        "whole_plan_valid": errors == [], "usable_preview": usable, "usable_lead_ms": lead,
        "validation_error_count": len(errors) if errors is not None else None,
    }
    trace = {
        "id": f"{city}-{days}-{repeat}", "days": days, "firstMs": first_ms, "doneMs": full_ms,
        "itinerary": [
            {"title": d.theme, "stops": [aliases[s.id].name for s in d.stops]}
            for d in full.days
        ],
    } if usable and lead is not None and lead > 0 else None
    return row, trace


async def run(args):
    os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "false"
    os.environ.setdefault("DATABASE_URL", "postgresql://localhost/unused")
    settings = get_settings()
    if settings.llm_model != FLASH_LITE or not os.environ.get("GOOGLE_API_KEY"):
        raise SystemExit("Configure the verified free-tier Gemini 3.5 Flash-Lite key and model.")
    model = get_chat_model(settings).bind(
        response_mime_type="application/json", response_json_schema=TripPlanChoice.model_json_schema()
    )
    traces = []
    start_date = date.fromisoformat(args.start_date)
    next_call = 0.0
    with Path(args.csv).open("x", newline="") as output:
        writer = None
        for repeat in range(1, args.repeats + 1):
            for index, case in enumerate(CASES):
                modes = ("stream", "blocking") if (repeat + index) % 2 else ("blocking", "stream")
                for mode in modes:
                    await asyncio.sleep(max(0, next_call - perf_counter()))
                    next_call = perf_counter() + 5
                    row, trace = await probe(model, case, repeat, start_date, mode, args.timeout)
                    if writer is None:
                        writer = csv.DictWriter(output, fieldnames=row.keys())
                        writer.writeheader()
                    writer.writerow({k: round(v, 3) if isinstance(v, float) else v for k, v in row.items()})
                    output.flush()
                    if trace is not None:
                        traces.append(trace)
                        Path(args.traces).write_text(json.dumps(traces, indent=2) + "\n")
                    print(case, repeat, mode, row["outcome"], round(row["stream_end_ms"]), "ms",
                          "usable", row["usable_preview"], "lead ms", row["usable_lead_ms"], flush=True)
    Path(args.traces).write_text(json.dumps(traces, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv")
    parser.add_argument("traces")
    parser.add_argument("--repeats", choices=(1, 2, 3), type=int, default=3)
    parser.add_argument("--timeout", type=int, default=20)
    parser.add_argument("--start-date", default="2026-12-07")
    warnings.filterwarnings("ignore", message="Model .* uses fixed sampling defaults")
    asyncio.run(run(parser.parse_args()))
