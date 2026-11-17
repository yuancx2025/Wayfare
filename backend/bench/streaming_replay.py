"""Serve recorded Gemini timelines to the isolated iOS streaming replay app."""

import argparse
import asyncio
import json
from collections import defaultdict
from pathlib import Path
from time import perf_counter
from typing import Literal

import uvicorn
from fastapi import FastAPI
from fastapi.responses import StreamingResponse


def select_traces(records):
    grouped = defaultdict(list)
    for trace in records:
        grouped[trace["id"].rsplit("-", 1)[0]].append(trace)
    selected = {}
    for case, traces in grouped.items():
        ordered = sorted(traces, key=lambda t: t["doneMs"] - t["firstMs"])
        selected[case] = ordered[len(ordered) // 2]
    short = [trace for trace in selected.values() if trace["days"] == 3]
    long = [trace for trace in selected.values() if trace["days"] == 7]
    if len(short) < 2 or not long:
        raise ValueError("Replay needs two valid 3-day cases and one valid 7-day case.")
    return short[:2] + long[-1:]


def create_app(traces, result_path):
    app = FastAPI()
    by_id = {t["id"]: t for t in traces}

    @app.get("/traces")
    async def get_traces():
        return traces

    @app.get("/stream/{trace_id}")
    async def stream(trace_id: str, fault: Literal["none", "retry", "cancel"] = "none"):
        trace = by_id[trace_id]
        itinerary = trace["itinerary"]
        if fault == "none":
            events = [
                (30, "step", {"index": 1}),
                (trace["firstMs"], "day", {"day": itinerary[0]}),
                (trace["doneMs"], "done", {"itinerary": itinerary}),
            ]
        else:
            events = [
                (30, "step", {"index": 1}),
                (250, "day", {"day": {"title": "Withdrawn preview", "stops": ["Discard this stop"]}}),
                (650, "reset", {}),
                (1000, "day", {"day": itinerary[0]}),
                (1350, "done", {"itinerary": itinerary}),
            ]

        async def frames():
            start = perf_counter()
            for at, event, data in events:
                await asyncio.sleep(max(0, at / 1000 - (perf_counter() - start)))
                payload = f"event: {event}\r\ndata: {json.dumps(data)}\r\n\r\n".encode()
                yield payload[:8]
                await asyncio.sleep(0.001)
                yield payload[8:]

        return StreamingResponse(frames(), media_type="text/event-stream")

    @app.post("/result")
    async def save_result(result: dict):
        with result_path.open("x") as output:
            json.dump(result, output, indent=2)
            output.write("\n")
        print(f"Received {len(result['runs'])} timed trials and {len(result['checks'])} fault checks", flush=True)
        return {"saved": True}

    return app


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("traces", type=Path)
    parser.add_argument("result", type=Path)
    args = parser.parse_args()
    if args.result.exists():
        raise SystemExit("Choose a new result path.")
    traces = select_traces(json.loads(args.traces.read_text()))
    uvicorn.run(create_app(traces, args.result), host="127.0.0.1", port=8765, access_log=False)
