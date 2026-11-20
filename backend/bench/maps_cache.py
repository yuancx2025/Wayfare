"""Measure what `place_cache` saves: Google requests, hit rate and list cost, with the cache off vs on.

Simulated users go through the app's real HTTP API, in the order the iOS app makes its calls, against a local fake
Google (bench/fake_google.py). Both arms replay the same users from an empty database. `live` instead sends a few
users to the real Google APIs, with a hard request cap, to check what Google bills. See docs/benchmarks/maps-cache.md.

From backend/, with a disposable local database whose name ends in _bench:
  DATABASE_URL=postgresql://localhost/wayfare_maps_bench .venv/bin/python -m bench.maps_cache run OUT.csv
  .venv/bin/python -m bench.maps_cache report OUT.csv [MORE.csv ...] [--summary SUMMARY.csv]
  DATABASE_URL=... .venv/bin/python -m bench.maps_cache live OUT.csv --confirm-billing  # Maps key from .env
"""

import argparse
import asyncio
import csv
import json
import logging
import math
import os
import random
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from time import perf_counter
from typing import Any
from unittest.mock import patch
from uuid import UUID

import httpx
from sqlalchemy.engine import make_url

from bench.fake_google import FakeGoogle
from bench.maps_metering import (
    PRICE_LIST, PRICES_CHECKED, SKUS, UNCACHED_KINDS, CountingTransport,
)

FIRST_DAY = date(2026, 12, 7)
PREF_SETS = {
    "culture": {"interests": ["culture", "museums", "architecture"], "food": ["local-classics", "street-food"]},
    "food": {"interests": ["food", "nature", "culture"], "food": ["local-classics", "street-food"]},
    "outdoors": {"interests": ["nature", "architecture"], "food": ["cafes"]},
}
PREF_WEIGHTS = {"culture": 0.5, "food": 0.3, "outdoors": 0.2}
DAY_WEIGHTS = {1: 0.3, 3: 0.5, 7: 0.2}
KIND_LABELS = {
    "ts": "Candidate text searches", "leg": "Route legs (computeRoutes)", "nearby": "Nearby searches (edits)",
    "details": "Place details", "dest": "Destination details", "cities": "City searches", "photos": "Photo lookups",
    "photo-uri": "Photo URLs", "alt": "Shown alternatives (reused on replace)",
    "autocomplete": "Autocomplete (not cached)", "around": "Near-me search (not cached)",
}
COLUMNS = [
    "run", "arm", "ttl_h", "latency_ms", "seed", "users", "user", "visit", "sim_min", "step", "type",
    "status", "ms", "kind", "sku", "usd", "outcome",
]


@dataclass
class User:
    index: int
    city: str
    prefs: str
    days: int
    start_min: float
    return_min: float

    @property
    def sub(self) -> str:
        return f"user_maps_bench_{self.index:03d}"


def make_users(count: int, seed: int) -> list[User]:
    """Cities by Zipf-like popularity in catalog order, so the most popular city gets the most users."""
    from app.integrations.places.catalog_data import catalog_destinations

    rng = random.Random(seed)
    cities = [d.name for d in catalog_destinations()]
    users = []
    for i in range(count):
        start = rng.uniform(0, 24 * 60)
        users.append(User(
            index=i, city=rng.choices(cities, weights=[1 / (rank + 1) for rank in range(len(cities))])[0],
            prefs=rng.choices(list(PREF_WEIGHTS), weights=list(PREF_WEIGHTS.values()))[0],
            days=rng.choices(list(DAY_WEIGHTS), weights=list(DAY_WEIGHTS.values()))[0],
            start_min=start, return_min=start + rng.uniform(60, 12 * 60),
        ))
    return users


class SimClock:
    def __init__(self):
        self.base = datetime.now(timezone.utc)
        self.minutes = 0.0

    def now(self) -> datetime:
        return self.base + timedelta(minutes=self.minutes)


def cache_classes():
    from app.integrations.cache import PlaceCache

    class RecordingCache(PlaceCache):
        """The production cache, plus one CSV row per lookup or write."""

        def __init__(self, sessionmaker, ttl_s: int, rows: list, context: dict):
            super().__init__(sessionmaker, ttl_s)
            self._rows, self._context = rows, context

        def _count(self, keys, outcome: str) -> None:
            super()._count(keys, outcome)
            for key in keys:
                self._rows.append({**self._context, "type": "cache", "kind": key.partition(":")[0], "outcome": outcome})

    class NoCache(RecordingCache):
        """Every lookup misses and nothing is stored: what the app would do with no cache."""

        async def get(self, key: str):
            self._count([key], "miss")
            return None

        async def get_many(self, keys: list[str]) -> dict:
            self._count(set(keys), "miss")
            return {}

        async def set(self, key: str, payload, ttl_s: int | None = None) -> None:
            return None

        async def set_many(self, items: dict, ttl_s: int | None = None) -> None:
            return None

    return RecordingCache, NoCache


def check_database() -> None:
    url = os.environ.get("DATABASE_URL", "")
    name = make_url(url).database if url else None
    if not name or not name.endswith("_bench"):
        raise SystemExit("Set DATABASE_URL to a disposable local database whose name ends in _bench.")


async def reset_tables(*, create: bool = True) -> None:
    from app.db.registry import Base
    from app.db.session import get_engine

    async with get_engine().begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        if create:
            await conn.run_sync(Base.metadata.create_all)


def google_services(transport: CountingTransport, cache, key: str):
    from app.integrations.places.google import GooglePlaceProvider
    from app.integrations.places.google_client import GooglePlacesClient
    from app.integrations.routing.google import GoogleTravelRouter
    from app.integrations.routing.google_client import GoogleRoutesClient
    from app.integrations.services import Services

    http = httpx.AsyncClient(transport=transport, timeout=20)
    return Services(
        places=GooglePlaceProvider(GooglePlacesClient(key, http), cache),
        router=GoogleTravelRouter(GoogleRoutesClient(key, http), cache),
        llm=None, cache=cache, closers=[http.aclose],
    )


class Api:
    """Calls the app as the iOS client does and records one row per call."""

    def __init__(self, client: httpx.AsyncClient, rows: list, context: dict):
        self.client, self.rows, self.context = client, rows, context
        self.auth: dict[str, str] = {}

    def sign_in(self, sub: str) -> None:
        from tests.conftest import auth_headers

        self.auth = auth_headers(sub, expires_in=900)

    def _record(self, step: str, status: int, start: float) -> None:
        self.rows.append({**self.context, "step": step, "type": "app", "status": status, "ms": round((perf_counter() - start) * 1000, 2)})

    async def call(self, step: str, method: str, url: str, ok=(200,), **kwargs) -> httpx.Response:
        self.context["step"] = step
        start = perf_counter()
        resp = await self.client.request(method, url, headers=self.auth, **kwargs)
        self._record(step, resp.status_code, start)
        if resp.status_code not in ok:
            raise RuntimeError(f"{method} {url} returned {resp.status_code}: {resp.text[:300]}")
        return resp

    async def generate(self, draft: dict) -> dict:
        self.context["step"] = "generate"
        start = perf_counter()
        event, data, trip = "", [], None
        async with self.client.stream("POST", "/trips/generate", json=draft, headers=self.auth) as resp:
            async for line in resp.aiter_lines():
                if line.startswith("event:"):
                    event = line[6:].strip()
                elif line.startswith("data:"):
                    data.append(line[5:].lstrip())
                elif not line:
                    if event == "done":
                        trip = json.loads("\n".join(data))["trip"]
                        break
                    if event == "error":
                        raise RuntimeError(f"Generation failed: {' '.join(data)}")
                    event, data = "", []
            self._record("generate", resp.status_code, start)
        if trip is None:
            raise RuntimeError("Generation ended without a trip")
        return trip


def day_signature(day: dict) -> list:
    return [(a["placeId"], (a.get("legIn") or {}).get("mode"), (a.get("legIn") or {}).get("minutes")) for a in day["activities"]]


async def first_visit(api: Api, user: User, rng: random.Random, sig: list) -> dict:
    """Search, plan, look around the trip, then make one edit, as in frontend/src/lib/api/remote.ts."""
    api.sign_in(user.sub)
    await api.call("me", "GET", "/me")
    session = str(UUID(int=rng.getrandbits(128)))
    suggestions = []
    for typed in sorted({user.city[:3], user.city[:5], user.city}, key=len):
        suggestions = (await api.call("autocomplete", "GET", "/places/autocomplete", params={"q": typed, "session": session})).json()
    pick = next(s for s in suggestions if s["name"] == user.city)
    dest = (await api.call("resolve", "POST", "/destinations/resolve", json={"placeId": pick["placeId"]})).json()

    prefs = {"pace": "balanced", "transport": "transit", "budget": "moderate", **PREF_SETS[user.prefs]}
    end = FIRST_DAY + timedelta(days=user.days - 1)
    draft = {
        "destination": dest["name"], "destinationId": dest["id"], "startDate": FIRST_DAY.isoformat(),
        "endDate": end.isoformat(), "travelers": 2, "prefs": prefs,
    }
    trip = await api.generate(draft)
    sig.append(("trip", [day_signature(d) for d in trip["days"]]))

    if trip["image"]:
        await api.call("trip-image", "GET", trip["image"], ok=(302,))
    for i in range(len(trip["days"])):
        route = (await api.call("day-map", "GET", f"/trips/{trip['id']}/days/{i}/route")).json()
        sig.append(("route", i, route["source"], [(leg["mode"], leg["polyline"]) for leg in route["legs"]]))

    day = trip["days"][0]
    acts = day["activities"]
    for a in {a["placeId"]: a for a in (acts[0], acts[-1])}.values():
        params = {"date": day["date"], "startMin": a["startMin"], "durationMin": a["durationMin"]}
        sig.append(("details", (await api.call("place-details", "GET", f"/places/{a['placeId']}", params=params)).json()))

    target = acts[min(1, len(acts) - 1)]
    alts = (await api.call("alternatives", "GET", f"/trips/{trip['id']}/days/0/activities/{target['id']}/alternatives")).json()
    sig.append(("alternatives", [p["id"] for p in alts]))
    if alts:
        body = {"kind": "replace", "activityId": target["id"], "placeId": alts[0]["id"]}
        replaced = (await api.call("propose-replace", "POST", f"/trips/{trip['id']}/days/0/proposals", json=body)).json()
        sig.append(("replace", [c["text"] for c in replaced["changes"]], day_signature(replaced["day"])))
    proposal = (await api.call("propose-more-food", "POST", f"/trips/{trip['id']}/days/0/proposals", json={"kind": "more-food"})).json()
    sig.append(("proposal", [c["text"] for c in proposal["changes"]], day_signature(proposal["day"])))
    if proposal.get("proposalId"):
        trip = (await api.call("apply", "POST", f"/trips/{trip['id']}/proposals/{proposal['proposalId']}/apply")).json()
        sig.append(("applied", day_signature(trip["days"][0])))
    return trip


async def return_visit(api: Api, user: User, trip: dict, sig: list) -> None:
    """Hours later: open the trip again and look at the first day's map."""
    api.sign_in(user.sub)
    if trip["image"]:
        await api.call("trip-image", "GET", trip["image"], ok=(302,))
    route = (await api.call("day-map", "GET", f"/trips/{trip['id']}/days/0/route")).json()
    sig.append(("return-route", route["source"], [(leg["mode"], leg["polyline"]) for leg in route["legs"]]))


def google_rows(transport: CountingTransport) -> list[dict]:
    return [
        {**c.context, "type": "google", "kind": c.kind, "sku": c.sku, "status": c.status,
         "ms": round(c.ms or 0, 2), "usd": c.usd}
        for c in transport.calls
    ]


async def run_arm(arm: str, users: list[User], ttl_s: int, latency_s: float, seed: int, run: dict) -> tuple[list, dict]:
    from app.db.session import get_sessionmaker
    from bench.baseline import generation_server

    await reset_tables()
    rows: list[dict] = []
    transport = CountingTransport(httpx.MockTransport(FakeGoogle(latency_s)))
    transport.context.update(run, arm=arm)
    recording, no_cache = cache_classes()
    cache = (recording if arm == "on" else no_cache)(get_sessionmaker(), ttl_s, rows, transport.context)
    services = google_services(transport, cache, "fake-key")
    clock, rng = SimClock(), random.Random(seed)
    events = sorted([(u.start_min, 1, u) for u in users] + [(u.return_min, 2, u) for u in users], key=lambda e: (e[0], e[1], e[2].index))
    signatures: dict[int, list] = defaultdict(list)
    trips: dict[int, dict] = {}
    with patch("app.integrations.cache.utcnow", clock.now):
        async with generation_server(services, {}) as client:
            api = Api(client, rows, transport.context)
            for at, visit, user in events:
                clock.minutes = at
                transport.context.update(user=user.index, visit=visit, sim_min=round(at, 1), step="")
                if visit == 1:
                    trips[user.index] = await first_visit(api, user, rng, signatures[user.index])
                else:
                    await return_visit(api, user, trips[user.index], signatures[user.index])
    return rows + google_rows(transport), dict(signatures)


def check_invariants(rows: list[dict], signatures: dict[str, dict]) -> list[str]:
    """Problems that would make the comparison unfair or the counts wrong. Empty means the run is valid."""
    problems = []
    if signatures["off"] != signatures["on"]:
        diff = [u for u in signatures["off"] if signatures["off"][u] != signatures["on"].get(u)]
        problems.append(f"Itineraries differ between arms for users {diff[:10]}")
    lookups = {arm: Counter() for arm in ("off", "on")}
    misses = {arm: Counter() for arm in ("off", "on")}
    requests = {arm: Counter() for arm in ("off", "on")}
    for r in rows:
        if r["type"] == "cache" and r["outcome"] in ("hit", "miss"):
            lookups[r["arm"]][r["kind"]] += 1
            misses[r["arm"]][r["kind"]] += r["outcome"] == "miss"
        elif r["type"] == "google":
            requests[r["arm"]][r["kind"]] += 1
    for arm in ("off", "on"):
        # "alt" stores what the app already fetched, so its misses lead to a Place Details lookup, not a request.
        for kind in (set(misses[arm]) | {k for k in requests[arm] if k not in UNCACHED_KINDS}) - {"alt"}:
            if misses[arm][kind] != requests[arm][kind]:
                problems.append(f"{arm}: {misses[arm][kind]} {kind} misses but {requests[arm][kind]} Google requests")
    # A hit on "alt" (alternatives the user was shown) replaces a Place Details lookup, so add those back.
    expected = lookups["on"] + Counter({"details": lookups["on"]["alt"] - misses["on"]["alt"]})
    if lookups["off"] != expected:
        problems.append(f"The arms made different cache lookups: off {dict(lookups['off'])}, on {dict(lookups['on'])}")
    if sum(requests["on"].values()) > sum(requests["off"].values()):
        problems.append("The cache arm sent more Google requests than the no-cache arm")
    return problems


def write_csv(path: str, rows: list[dict]) -> None:
    with Path(path).open("x", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=COLUMNS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


SUMMARY_COLUMNS = [
    "run", "arm", "ttl_h", "latency_ms", "seed", "users", "kind", "sku", "google_requests", "list_usd",
    "cache_lookups", "cache_hits", "cache_misses", "step", "calls", "p50_ms", "p95_ms",
]


def write_summary(path: str, rows: list[dict]) -> None:
    """One row per run, arm and request kind (Google requests, cost, cache outcomes), then one per app step (latency)."""
    groups: dict[tuple, list[dict]] = defaultdict(list)
    for r in rows:
        groups[(r["run"], r["arm"])].append(r)
    out = []
    for (name, arm), rs in groups.items():
        base = {k: rs[0][k] for k in ("run", "arm", "ttl_h", "latency_ms", "seed", "users")}
        kinds: dict[str, dict] = defaultdict(lambda: {"google_requests": 0, "list_usd": 0.0, "cache_hits": 0, "cache_misses": 0})
        ms: dict[str, list[float]] = defaultdict(list)
        for r in rs:
            if r["type"] == "google":
                k = kinds[r["kind"]]
                k["google_requests"] += 1
                k["list_usd"] += float(r["usd"])
                k["sku"] = r["sku"]
            elif r["type"] == "cache" and r["outcome"] in ("hit", "miss"):
                kinds[r["kind"]]["cache_hits" if r["outcome"] == "hit" else "cache_misses"] += 1
            elif r["type"] == "app":
                ms[r["step"]].append(float(r["ms"]))
        for kind, k in sorted(kinds.items()):
            out.append({**base, "kind": kind, **k, "list_usd": round(k["list_usd"], 4),
                        "cache_lookups": k["cache_hits"] + k["cache_misses"]})
        if float(base["latency_ms"]) > 0:
            for step, values in ms.items():
                out.append({**base, "step": step, "calls": len(values),
                            "p50_ms": round(percentile(values, .5), 1), "p95_ms": round(percentile(values, .95), 1)})
    with Path(path).open("x", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=SUMMARY_COLUMNS)
        writer.writeheader()
        writer.writerows(out)


def percentile(values: list[float], q: float) -> float:
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, max(0, math.ceil(q * len(ordered)) - 1))]


def money(x: float) -> str:
    return f"${x:,.2f}" if x >= 1 else f"${x:.4f}"


def report(rows: list[dict]) -> str:
    """Markdown tables for every run in `rows` (rows read back from CSV are strings)."""
    runs: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        runs[r["run"]].append(r)
    out = []
    for name, rs in runs.items():
        first = rs[0]
        users = int(first["users"])
        req = {arm: Counter() for arm in ("off", "on")}
        usd = {arm: defaultdict(float) for arm in ("off", "on")}
        sku = {}
        cache = defaultdict(Counter)
        ms = {arm: defaultdict(list) for arm in ("off", "on")}
        for r in rs:
            arm = r["arm"]
            if r["type"] == "google":
                req[arm][r["kind"]] += 1
                usd[arm][r["kind"]] += float(r["usd"])
                sku[r["kind"]] = r["sku"]
            elif r["type"] == "cache" and arm == "on":
                cache[r["kind"]][r["outcome"]] += 1
            elif r["type"] == "app":
                ms[arm][r["step"]].append(float(r["ms"]))
        out.append(f"### {name}\n")
        out.append(f"{users} users over 24 simulated hours, TTL {first['ttl_h']} h, seed {first['seed']}, "
                   f"simulated Google latency {first['latency_ms']} ms.\n")
        out.append("| Cache | Lookups | Hits | Misses | Hit rate |\n| --- | ---: | ---: | ---: | ---: |")
        total_hits = total_lookups = 0
        for kind in sorted(cache, key=lambda k: -sum(cache[k][o] for o in ("hit", "miss"))):
            hits, miss = cache[kind]["hit"], cache[kind]["miss"]
            if not hits + miss:
                continue
            total_hits, total_lookups = total_hits + hits, total_lookups + hits + miss
            out.append(f"| {KIND_LABELS.get(kind, kind)} | {hits + miss} | {hits} | {miss} | {hits / (hits + miss):.0%} |")
        out.append(f"| **All** | **{total_lookups}** | **{total_hits}** | **{total_lookups - total_hits}** | **{total_hits / total_lookups:.0%}** |\n")
        out.append("| Google requests | SKU | Off | On | Saved | List cost off | List cost on |\n| --- | --- | ---: | ---: | ---: | ---: | ---: |")
        for kind in sorted(req["off"], key=lambda k: -usd["off"][k]):
            off, on = req["off"][kind], req["on"][kind]
            out.append(f"| {KIND_LABELS.get(kind, kind)} | {sku[kind]} | {off} | {on} | {off - on} | "
                       f"{money(usd['off'][kind])} | {money(usd['on'][kind])} |")
        cost_off, cost_on = sum(usd["off"].values()), sum(usd["on"].values())
        n_off, n_on = sum(req["off"].values()), sum(req["on"].values())
        out.append(f"| **All** | | **{n_off}** | **{n_on}** | **{n_off - n_on}** | **{money(cost_off)}** | **{money(cost_on)}** |\n")
        uncached_on = sum(usd["on"][k] for k in UNCACHED_KINDS)
        out.append(f"- List cost per user: **{money(cost_off / users)} → {money(cost_on / users)}** "
                   f"({(cost_on - cost_off) / cost_off:+.0%}). Google requests {(n_on - n_off) / n_off:+.0%}.")
        out.append(f"- Spend the cache can't touch (autocomplete, near-me search): {money(uncached_on)} of {money(cost_on)} with the cache on.")
        if float(first["latency_ms"]) > 0:
            out.append("\n| Step (simulated latency) | Calls | p50 off | p50 on | p95 off | p95 on |\n| --- | ---: | ---: | ---: | ---: | ---: |")
            for step in ms["off"]:
                a, b = ms["off"][step], ms["on"][step]
                out.append(f"| {step} | {len(a)} | {percentile(a, .5):.0f} ms | {percentile(b, .5):.0f} ms | "
                           f"{percentile(a, .95):.0f} ms | {percentile(b, .95):.0f} ms |")
        out.append("")
    out.append(f"Prices: first paid band of Google's list prices, checked {PRICES_CHECKED} ({PRICE_LIST}), before free monthly caps.")
    return "\n".join(out)


async def run(args) -> None:
    from bench.baseline import benchmark_settings

    check_database()
    benchmark_settings()
    users = make_users(args.users, args.seed)
    ttl_s = int(args.ttl_hours * 3600)
    run_info = {
        "run": f"ttl{args.ttl_hours:g}h-lat{args.google_latency_ms}ms-seed{args.seed}", "ttl_h": args.ttl_hours,
        "latency_ms": args.google_latency_ms, "seed": args.seed, "users": args.users,
    }
    rows, signatures = [], {}
    for arm in ("off", "on"):
        started = perf_counter()
        arm_rows, signatures[arm] = await run_arm(arm, users, ttl_s, args.google_latency_ms / 1000, args.seed, run_info)
        rows += arm_rows
        print(f"{arm}: {sum(r['type'] == 'google' for r in arm_rows)} Google requests, "
              f"{sum(r['type'] == 'app' for r in arm_rows)} app calls, {perf_counter() - started:.0f} s", flush=True)
    await reset_tables(create=False)
    problems = check_invariants(rows, signatures)
    write_csv(args.output, rows)
    print(report(rows))
    if problems:
        raise SystemExit("Invalid run:\n- " + "\n- ".join(problems))


async def live(args) -> None:
    """A few real requests: two users plan the same city, so the second should be served from the cache."""
    from app.db.session import get_sessionmaker
    from bench.baseline import benchmark_settings, generation_server

    if not args.confirm_billing:
        raise SystemExit("This sends billed requests to Google. Re-run with --confirm-billing.")
    check_database()
    key = benchmark_settings().google_maps_api_key
    if not key:
        raise SystemExit("Set GOOGLE_MAPS_API_KEY to a server key with billing, Places API (New) and Routes API enabled.")
    worst = args.max_requests * max(price for price, _ in SKUS.values()) / 1000
    print(f"Up to {args.max_requests} Google requests, at most ${worst:.2f} at list prices.", flush=True)
    await reset_tables()
    rows: list[dict] = []
    transport = CountingTransport(httpx.AsyncHTTPTransport(), max_requests=args.max_requests)
    transport.context.update(run=f"live-{date.today().isoformat()}", arm="on", ttl_h=6, latency_ms=0, seed=0, users=2)
    recording, _ = cache_classes()
    cache = recording(get_sessionmaker(), 6 * 3600, rows, transport.context)
    services = google_services(transport, cache, key)
    rng = random.Random(0)
    try:
        async with generation_server(services, {}) as client:
            api = Api(client, rows, transport.context)
            for index in range(2):
                user = User(index=index, city=args.city, prefs="culture", days=1, start_min=0, return_min=0)
                transport.context.update(user=index, visit=1, sim_min=0, step="")
                await first_visit(api, user, rng, [])
    finally:
        rows += google_rows(transport)
        write_csv(args.output, rows)
        await reset_tables(create=False)  # Don't keep Google content once the run is over.
    by_user = Counter((r["user"], r["sku"]) for r in rows if r["type"] == "google")
    for (user, name), n in sorted(by_user.items()):
        print(f"user {user}: {n} x {name}")
    print(f"Counted cost at list prices: ${sum(c.usd for c in transport.calls):.4f}. Capped: {transport.capped}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("run", help="Both arms against the fake Google")
    p.add_argument("output")
    p.add_argument("--users", type=int, default=60)
    p.add_argument("--seed", type=int, default=11)
    p.add_argument("--ttl-hours", type=float, default=6)
    p.add_argument("--google-latency-ms", type=int, default=0)
    p = sub.add_parser("report", help="Print the tables for saved CSVs")
    p.add_argument("csv", nargs="+")
    p.add_argument("--summary", help="Also write per-run, per-arm totals by request kind and step to this CSV")
    p = sub.add_parser("live", help="Two users against real Google, capped")
    p.add_argument("output")
    p.add_argument("--city", default="Chicago")
    p.add_argument("--max-requests", type=int, default=60)
    p.add_argument("--confirm-billing", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.WARNING)
    if args.command == "report":
        rows: list[dict[str, Any]] = []
        for path in args.csv:
            with Path(path).open(newline="") as stream:
                rows += list(csv.DictReader(stream))
        print(report(rows))
        if args.summary:
            write_summary(args.summary, rows)
    else:
        asyncio.run(run(args) if args.command == "run" else live(args))


if __name__ == "__main__":
    main()
