"""Adjust Day must reproduce `frontend/src/domain/logic/adjust.ts` for catalog trips."""

import json
import re
from pathlib import Path

import pytest

from app.integrations.places.catalog_data import load_catalog
from app.features.adjustments import proposals as adjust
from app.contracts.travel import Trip

CASES = json.loads((Path(__file__).parent / "fixtures" / "ts_parity.json").read_text())


def norm_day(day: dict) -> dict:
    day = json.loads(json.dumps(day))
    for a in day["activities"]:
        if "legIn" in a:
            a["legIn"].pop("source", None)
    return day


def norm_proposal(p: dict) -> dict:
    # The TS version computes "frees about N min" after removing the stop, so it misses the following leg.
    # The Python port reports the full time; only that number is excluded from parity.
    changes = [{**c, "text": re.sub(r"frees about \d+ min", "frees about N min", c["text"])} for c in p["changes"]]
    return {**{k: v for k, v in p.items() if k != "proposalId"}, "day": norm_day(p["day"]), "changes": changes}


@pytest.mark.parametrize("case", CASES, ids=[f"{c['destinationId']}-{i}" for i, c in enumerate(CASES)])
async def test_adjustments_match_typescript(case, catalog_services):
    trip = Trip.model_validate(case["trip"])
    dest = load_catalog()[trip.destination_id][0]
    for day, expected in zip(trip.days, case["adjustments"]):
        i = day.index
        assert norm_proposal((await adjust.propose_relaxed(trip, i, catalog_services)).dump()) == norm_proposal(expected["relaxed"])
        assert norm_proposal((await adjust.propose_less_walking(trip, i, catalog_services)).dump()) == norm_proposal(expected["less-walking"])
        assert norm_proposal((await adjust.propose_more_food(trip, i, dest, catalog_services)).dump()) == norm_proposal(expected["more-food"])

        rep = expected["replace"]
        if rep is None:
            continue
        cands = await adjust.replacement_candidates(trip, i, rep["activityId"], dest, catalog_services)
        assert [c.id for c in cands] == rep["candidateIds"]
        if rep["proposal"]:
            got = await adjust.propose_replacement(trip, i, rep["activityId"], cands[0], catalog_services)
            assert norm_proposal(got.dump()) == norm_proposal(rep["proposal"])
