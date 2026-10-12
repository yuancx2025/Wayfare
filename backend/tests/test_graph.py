"""LangGraph planner: LLM curation, validation retries, heuristic fallback, Routes legs, progress steps."""

import json
from datetime import date
from pathlib import Path

from app.integrations.places.catalog_data import catalog_places, load_catalog
from app.features.planning.curation import DayChoice, StopChoice, TripPlanChoice
from app.features.planning.pipeline import run_planner
from app.domain.scheduler import build_trip_heuristic
from app.features.planning.schemas import TripDraft
from app.integrations.services import Services
from tests.conftest import FixedRouter, fake_llm
from tests.test_scheduler_parity import normalize_trip

CASE = json.loads((Path(__file__).parent / "fixtures" / "ts_parity.json").read_text())[0]
DRAFT = TripDraft.model_validate({**CASE["draft"], "destinationId": "nyc"})
DEST = load_catalog()["nyc"][0]


def candidates_from(messages) -> list[tuple[str, str]]:
    """(alias, category) pairs parsed from the curation prompt."""
    human = messages[1].content
    out = []
    for line in human.split("Candidates")[1].splitlines()[1:]:
        parts = [p.strip() for p in line.split("|")]
        if len(parts) > 2 and parts[0].startswith("c"):
            out.append((parts[0], parts[2]))
    return out


def valid_plan(messages, n_days=5, sights=3) -> TripPlanChoice:
    cands = candidates_from(messages)
    sight_ids = [a for a, c in cands if c != "food"]
    food_ids = [a for a, c in cands if c == "food"]
    days = []
    for d in range(n_days):
        stops = [StopChoice(id=a, why=f"LLM reason {a}") for a in sight_ids[d * sights : (d + 1) * sights]]
        stops.append(StopChoice(id=food_ids[2 * d], slot="lunch", why="LLM lunch"))
        stops.append(StopChoice(id=food_ids[2 * d + 1], slot="dinner", why="LLM dinner"))
        days.append(DayChoice(theme=f"LLM theme {d + 1}", stops=stops))
    return TripPlanChoice(days=days)


def invalid_plan(messages) -> TripPlanChoice:
    return TripPlanChoice(days=[DayChoice(theme="bad", stops=[StopChoice(id="c999", why="made up")])])


def heuristic_trip():
    return build_trip_heuristic("trip-x", DEST, catalog_places("nyc"), CASE["draft"]["startDate"], CASE["draft"]["endDate"], 2, DRAFT.prefs)


async def test_without_llm_matches_typescript_planner(catalog_services: Services):
    steps: list[int] = []

    async def on_step(i):
        steps.append(i)

    trip = await run_planner(catalog_services, "trip-x", DEST, DRAFT, on_step)
    assert normalize_trip(trip.dump()) == normalize_trip(heuristic_trip().dump())
    assert steps == [1, 2, 3, 4]


async def test_llm_plan_is_validated_and_retried_with_feedback(catalog_services: Services):
    llm = fake_llm([invalid_plan, valid_plan])
    catalog_services.llm = llm
    trip = await run_planner(catalog_services, "trip-x", DEST, DRAFT)
    assert len(llm.seen) == 2
    assert "Your previous plan had problems" in llm.seen[1][-1].content
    assert "'c999' is not a candidate id" in llm.seen[1][-1].content
    assert [d.theme for d in trip.days] == [f"LLM theme {i}" for i in range(1, 6)]
    assert all(a.why.startswith("LLM") for d in trip.days for a in d.activities)
    ids = [a.place_id for d in trip.days for a in d.activities]
    assert len(ids) == len(set(ids)) and set(ids) <= {p.id for p in catalog_places("nyc")}
    for d in trip.days:
        assert [a.slot for a in d.activities].count("lunch") == 1
        slots = [a.slot for a in d.activities]
        assert all(s == "evening" for s in slots[slots.index("dinner") + 1 :])
        assert d.activities[0].start_min == 555


async def test_falls_back_to_heuristic_after_max_retries(catalog_services: Services):
    llm = fake_llm([invalid_plan] * 3)
    catalog_services.llm = llm
    trip = await run_planner(catalog_services, "trip-x", DEST, DRAFT)
    assert len(llm.seen) == 3  # first attempt + 2 retries
    assert normalize_trip(trip.dump()) == normalize_trip(heuristic_trip().dump())


async def test_llm_errors_use_heuristic_plan(catalog_services: Services):
    def boom(_):
        raise RuntimeError("rate limited")

    catalog_services.llm = fake_llm([boom])
    trip = await run_planner(catalog_services, "trip-x", DEST, DRAFT)
    assert normalize_trip(trip.dump()) == normalize_trip(heuristic_trip().dump())


async def test_routes_api_times_replace_estimates(catalog_services: Services):
    router = FixedRouter(minutes=7)
    catalog_services.router = router
    trip = await run_planner(catalog_services, "trip-x", DEST, DRAFT)
    legs = [a.leg_in for d in trip.days for a in d.activities if a.leg_in]
    assert legs and all(leg.source == "google" and leg.minutes == 7 for leg in legs)
    assert router.calls >= 1


def test_draft_validation():
    import pytest
    from pydantic import ValidationError

    base = {**CASE["draft"]}
    with pytest.raises(ValidationError, match="End date must be on or after"):
        TripDraft.model_validate({**base, "endDate": "2030-05-01"})
    with pytest.raises(ValidationError, match="10 days or fewer"):
        TripDraft.model_validate({**base, "endDate": "2030-05-30"})
    with pytest.raises(ValidationError, match="in the past"):
        TripDraft.model_validate({**base, "startDate": "2020-01-01", "endDate": "2020-01-02"})
    assert TripDraft.model_validate({**base, "startDate": date.today().isoformat(), "endDate": date.today().isoformat()}).day_count == 1
