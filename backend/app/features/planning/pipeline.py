"""Itinerary generation as a LangGraph StateGraph.

fetch_candidates -> normalize -> curate -> validate --(ok)--> schedule -> legs -> finalize
                                    ^          |--(errors, retries left)--> curate
                                    |          '--(errors, out of retries)--> fallback -> schedule
The LLM picks place ids and writes explanations; scheduling and travel math stay deterministic.
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from functools import lru_cache
from typing import Literal, TypedDict

from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, StateGraph

from app.contracts.travel import Day, Destination, Place, Trip
from app.core.config import get_settings
from app.core.exceptions import PlanningError
from app.domain.scheduler import LegTable, PlannedDay, add_days, assemble_trip, heuristic_curate, retime_day, schedule_day, score_place
from app.features.planning.curation import TripPlanChoice, curate_messages, validate_choice
from app.features.planning.schemas import TripDraft
from app.integrations.routing.legs import resolve_legs
from app.integrations.services import Services

log = logging.getLogger(__name__)

STEP_LABELS = [
    "Finding places that match your interests",
    "Grouping nearby places into days",
    "Estimating travel time between stops",
    "Pacing each day",
    "Adding meals and breathing room",
]
# Step shown as "current" once a node finishes.
NODE_STEP = {"normalize": 1, "schedule": 2, "legs": 3, "finalize": 4}
MAX_LLM_SIGHTS = 40
MAX_LLM_FOODS = 24


class PlanState(TypedDict, total=False):
    trip_id: str
    dest: Destination
    draft: TripDraft
    dates: list[str]
    candidates: list[Place]
    aliases: dict[str, Place]
    choice: TripPlanChoice | None
    plan: list[PlannedDay]
    errors: list[str]
    attempts: int
    curated_by: Literal["llm", "heuristic"]
    days: list[Day]
    legs: LegTable
    trip: Trip


def _services(config: RunnableConfig) -> Services:
    return config["configurable"]["services"]


async def fetch_candidates(state: PlanState, config: RunnableConfig) -> PlanState:
    places = await _services(config).places.candidates(state["dest"], state["draft"].prefs)
    if not places:
        raise PlanningError(f"We couldn't find enough places in {state['dest'].name} to plan around.", retryable=False)
    return {"candidates": places}


async def normalize(state: PlanState, config: RunnableConfig) -> PlanState:
    """Dedupe and keep the strongest candidates (short aliases keep ids copyable for the model)."""
    prefs = state["draft"].prefs
    seen: set[str] = set()
    unique = [p for p in state["candidates"] if not (p.id in seen or seen.add(p.id))]
    rank = lambda p: score_place(p, prefs) + (p.rating or 0) * 0.3  # noqa: E731
    sights = sorted((p for p in unique if p.category != "food"), key=rank, reverse=True)[:MAX_LLM_SIGHTS]
    foods = sorted((p for p in unique if p.category == "food"), key=rank, reverse=True)[:MAX_LLM_FOODS]
    aliases = {f"c{i + 1}": p for i, p in enumerate(sights + foods)}
    return {"candidates": unique, "aliases": aliases, "attempts": 0, "errors": []}


async def curate(state: PlanState, config: RunnableConfig) -> PlanState:
    llm = _services(config).llm
    if llm is None:
        return _heuristic(state)
    draft = state["draft"]
    msgs = curate_messages(state["dest"], draft.prefs, state["dates"], draft.travelers, state["aliases"], state.get("errors") or None)
    try:
        choice = await llm.with_structured_output(TripPlanChoice).ainvoke(msgs)
    except Exception as e:  # noqa: BLE001 - model/network failure: use the deterministic planner instead
        log.warning("LLM curation failed, using heuristic plan: %s", e)
        return _heuristic(state)
    return {"choice": choice, "curated_by": "llm", "attempts": state.get("attempts", 0) + 1}  # type: ignore[typeddict-item]


def _heuristic(state: PlanState) -> PlanState:
    dest, prefs = state["dest"], state["draft"].prefs
    plan = heuristic_curate(state["candidates"], dest.center, len(state["dates"]), prefs)
    return {"plan": plan, "curated_by": "heuristic", "errors": [], "choice": None}


async def validate(state: PlanState, config: RunnableConfig) -> PlanState:
    if state.get("curated_by") == "heuristic":
        return {"errors": []}
    errors, plan = validate_choice(state.get("choice"), state["aliases"], state["dates"], state["draft"].prefs)
    if errors:
        log.info("Plan attempt %s rejected: %s", state.get("attempts"), errors)
    return {"errors": errors, "plan": plan}


def after_validate(state: PlanState) -> str:
    if not state.get("errors"):
        return "schedule"
    if state.get("attempts", 0) <= get_settings().curate_max_retries:
        return "curate"
    return "fallback"


async def fallback(state: PlanState, config: RunnableConfig) -> PlanState:
    log.warning("LLM plan still invalid after retries; using heuristic plan")
    return _heuristic(state)


async def schedule(state: PlanState, config: RunnableConfig) -> PlanState:
    prefs, trip_id = state["draft"].prefs, state["trip_id"]
    days = [schedule_day(trip_id, i, state["dates"][i], planned, prefs) for i, planned in enumerate(state["plan"])]
    return {"days": days}


async def legs(state: PlanState, config: RunnableConfig) -> PlanState:
    return {"legs": await resolve_legs(state["days"], state["draft"].prefs.transport, _services(config).router)}


async def finalize(state: PlanState, config: RunnableConfig) -> PlanState:
    draft, dest = state["draft"], state["dest"]
    days = [retime_day(d, draft.prefs, state["legs"]) for d in state["days"]]
    trip = assemble_trip(state["trip_id"], dest, draft.start_date.isoformat(), draft.end_date.isoformat(), draft.travelers, draft.prefs, days)
    return {"trip": trip}


@lru_cache
def build_graph():
    g = StateGraph(PlanState)
    for name, fn in [("fetch_candidates", fetch_candidates), ("normalize", normalize), ("curate", curate), ("validate", validate),
                     ("fallback", fallback), ("schedule", schedule), ("legs", legs), ("finalize", finalize)]:
        g.add_node(name, fn)
    g.add_edge(START, "fetch_candidates")
    g.add_edge("fetch_candidates", "normalize")
    g.add_edge("normalize", "curate")
    g.add_edge("curate", "validate")
    g.add_conditional_edges("validate", after_validate, {"schedule": "schedule", "curate": "curate", "fallback": "fallback"})
    g.add_edge("fallback", "schedule")
    g.add_edge("schedule", "legs")
    g.add_edge("legs", "finalize")
    g.add_edge("finalize", END)
    return g.compile()


async def run_planner(services: Services, trip_id: str, dest: Destination, draft: TripDraft, on_step: Callable[[int], Awaitable[None]] | None = None) -> Trip:
    dates = [add_days(draft.start_date.isoformat(), i) for i in range(draft.day_count)]
    state: PlanState = {"trip_id": trip_id, "dest": dest, "draft": draft, "dates": dates}
    last_step, trip = 0, None
    config: RunnableConfig = {"configurable": {"services": services}, "recursion_limit": 40}
    async for update in build_graph().astream(state, config=config, stream_mode="updates"):
        for node, delta in update.items():
            step = NODE_STEP.get(node)
            if on_step and step and step > last_step:
                last_step = step
                await on_step(step)
            if node == "finalize" and delta:
                trip = delta["trip"]
    if trip is None:
        raise PlanningError("The planner stopped before finishing your trip.")
    return trip
