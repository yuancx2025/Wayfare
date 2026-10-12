"""The Python scheduler must reproduce the TypeScript planner exactly (fixtures from scripts/export_ts_fixtures.mjs)."""

import json
from pathlib import Path

import pytest

from app.integrations.places.catalog_data import catalog_places, load_catalog
from app.domain.scheduler import build_trip_heuristic
from app.contracts.travel import Preferences

CASES = json.loads((Path(__file__).parent / "fixtures" / "ts_parity.json").read_text())


def normalize_trip(trip: dict) -> dict:
    trip = {k: v for k, v in trip.items() if k not in ("createdAt", "version")}
    for day in trip["days"]:
        for a in day["activities"]:
            if "legIn" in a:
                a["legIn"] = {k: v for k, v in a["legIn"].items() if k != "source"}
    return trip


@pytest.mark.parametrize("case", CASES, ids=[f"{c['destinationId']}-{i}" for i, c in enumerate(CASES)])
def test_build_trip_matches_typescript(case):
    dest, _ = load_catalog()[case["destinationId"]]
    draft = case["draft"]
    trip = build_trip_heuristic(
        case["trip"]["id"], dest, catalog_places(dest.id), draft["startDate"], draft["endDate"],
        draft["travelers"], Preferences.model_validate(draft["prefs"]),
    )
    assert normalize_trip(trip.dump()) == normalize_trip(case["trip"])
