"""Bundled destinations + places exported from `frontend/src/domain/data/places.ts` (see scripts/export_ts_fixtures.mjs).

Seeds the curated Explore list and backs the offline place provider when no Google key is configured.
"""

import json
from functools import lru_cache
from pathlib import Path

from app.contracts.travel import Destination, Place

CATALOG_PATH = Path(__file__).with_name("catalog.json")


@lru_cache
def load_catalog() -> dict[str, tuple[Destination, list[Place]]]:
    raw = json.loads(CATALOG_PATH.read_text())
    out: dict[str, tuple[Destination, list[Place]]] = {}
    for d in raw:
        places = [Place.model_validate(p) for p in d.pop("places")]
        out[d["id"]] = (Destination.model_validate(d), places)
    return out


def catalog_destinations() -> list[Destination]:
    return [d for d, _ in load_catalog().values()]


def catalog_places(destination_id: str) -> list[Place]:
    entry = load_catalog().get(destination_id)
    return entry[1] if entry else []


def catalog_place(place_id: str) -> Place | None:
    for _, places in load_catalog().values():
        for p in places:
            if p.id == place_id:
                return p
    return None


def find_catalog_destination(query: str) -> Destination | None:
    """Same matching rule as `findDestination` in the frontend."""
    q = query.strip().lower()
    if not q:
        return None
    for d in catalog_destinations():
        if q == d.id or q.startswith(d.name.lower()) or f"{d.name}, {d.country}".lower() == q:
            return d
    return None
