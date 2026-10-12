"""Free-text Adjust Day ("make day 2 rainy-day friendly") as a tool-calling agent.

The tools edit a working copy of the day; the result is re-timed and diffed like every other proposal,
so the user always previews agent changes before applying them.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field

from langchain.agents import create_agent
from langchain_core.messages import HumanMessage
from langchain_core.tools import tool

from app.contracts.travel import Activity, Category, Day, Destination, Place, Slot, Trip
from app.core.exceptions import PlanningError
from app.domain.scheduler import distance_km, retime_day, to_activity
from app.features.adjustments.proposals import diff_days, finish, fmt_time, used_place_ids
from app.features.adjustments.schemas import Proposal
from app.integrations.services import Services

log = logging.getLogger(__name__)

AGENT_TIMEOUT_S = 45
AGENT_RECURSION_LIMIT = 24

SYSTEM_PROMPT = """You edit ONE day of a traveler's itinerary using the tools provided.
- Start with view_day. Make the smallest set of changes that satisfies the request.
- New places must come from search_places results. Never invent ids.
- Keep one lunch stop. Keep the day realistic for the traveler's pace.
- Timing and travel are recomputed automatically; use set_day_timing only for start time or breaks.
- When done, reply with one short sentence summarizing what you changed."""


@dataclass
class WorkingDay:
    trip: Trip
    day: Day
    activities: list[Activity]
    start_min: int
    buffer_min: int
    found: dict[str, Place] = field(default_factory=dict)

    def as_day(self) -> Day:
        return self.day.model_copy(update={"activities": self.activities, "start_min": self.start_min, "buffer_min": self.buffer_min})

    def describe(self) -> str:
        timed = retime_day(self.as_day(), self.trip.prefs)
        lines = [f"Day {self.day.index + 1} ({self.day.date}), starts {fmt_time(self.start_min)}, {self.buffer_min} min between stops:"]
        for a in timed.activities:
            lines.append(f"- {a.id} | {fmt_time(a.start_min)} | {a.name} | {a.category}{' | ' + a.slot if a.slot else ''} | {a.area}")
        return "\n".join(lines)


def build_tools(w: WorkingDay, dest: Destination, services: Services):
    def find_activity(activity_id: str) -> Activity | None:
        return next((a for a in w.activities if a.id == activity_id), None)

    def place_for(place_id: str) -> Place | None:
        return w.found.get(place_id)

    @tool
    def view_day() -> str:
        """Show the current schedule for the day being edited (activity ids, times, names, categories)."""
        return w.describe()

    @tool
    async def search_places(category: Category, near_activity_id: str | None = None) -> str:
        """Find places of a category (food, culture, nature, museums, shopping, nightlife, architecture)
        near one of the day's activities (defaults to the middle stop). Returns place ids usable by other tools."""
        anchor = find_activity(near_activity_id) if near_activity_id else None
        anchor = anchor or (w.activities[len(w.activities) // 2] if w.activities else None)
        center = (anchor.lat, anchor.lng) if anchor else (dest.center.lat, dest.center.lng)
        cats = [category]
        exclude = used_place_ids(w.trip) | {a.place_id for a in w.activities}
        places = [p for p in await services.places.nearby(dest, center, cats, 2000) if p.id not in exclude][:8]
        if not places:
            return "No unused places found nearby for that category."
        for p in places:
            w.found[p.id] = p
        ref = anchor or dest.center
        return "\n".join(
            f"{p.id} | {p.name} | {p.category} | {p.area} | {distance_km(ref, p):.1f} km away | {p.description[:80]}" for p in places
        )

    @tool
    async def get_place_details(place_id: str) -> str:
        """Opening hours, rating and links for a place id returned by search_places."""
        d = await services.places.details(place_id)
        if d is None:
            return "Unknown place id."
        hours = "; ".join(d.weekday_descriptions or []) or "hours unknown"
        return f"{d.name} | rating {d.rating or '-'} | {hours}"

    @tool
    def remove_activity(activity_id: str) -> str:
        """Remove an activity from the day by its activity id."""
        a = find_activity(activity_id)
        if a is None:
            return "No such activity id. Call view_day."
        w.activities = [x for x in w.activities if x.id != activity_id]
        return f"Removed {a.name}."

    @tool
    def insert_activity(place_id: str, after_activity_id: str | None = None, slot: Slot | None = None) -> str:
        """Insert a place (from search_places) after the given activity id (or at the start when omitted).
        Use slot lunch/dinner/snack for meals and evening for nightlife."""
        p = place_for(place_id)
        if p is None:
            return "Unknown place id. Use an id from search_places."
        idx = 0
        if after_activity_id:
            prev = find_activity(after_activity_id)
            if prev is None:
                return "No such activity id. Call view_day."
            idx = w.activities.index(prev) + 1
        w.activities.insert(idx, to_activity(w.trip.id, w.day.index, p, w.trip.prefs, slot))
        return f"Inserted {p.name}."

    @tool
    def swap_activity(activity_id: str, place_id: str) -> str:
        """Replace an activity with a place from search_places, keeping its position and meal slot."""
        a, p = find_activity(activity_id), place_for(place_id)
        if a is None or p is None:
            return "Unknown activity or place id."
        w.activities = [to_activity(w.trip.id, w.day.index, p, w.trip.prefs, a.slot) if x.id == activity_id else x for x in w.activities]
        return f"Swapped {a.name} for {p.name}."

    @tool
    def set_day_timing(start_time: str | None = None, minutes_between_stops: int | None = None) -> str:
        """Change the day's start time (HH:MM, 24h) and/or the breathing room between stops (0-60 minutes)."""
        if start_time:
            try:
                h, m = (int(x) for x in start_time.split(":"))
            except ValueError:
                return "start_time must look like 09:30."
            if not (6 <= h <= 13 and 0 <= m < 60):
                return "Start between 06:00 and 13:59."
            w.start_min = h * 60 + m
        if minutes_between_stops is not None:
            w.buffer_min = max(0, min(60, minutes_between_stops))
        return f"Day starts {fmt_time(w.start_min)} with {w.buffer_min} min between stops."

    return [view_day, search_places, get_place_details, remove_activity, insert_activity, swap_activity, set_day_timing]


async def propose_custom(trip: Trip, day_index: int, dest: Destination, instruction: str, services: Services) -> Proposal:
    if not services.agent_enabled:
        raise PlanningError("Free-text adjustments need an LLM with tool calling (set LLM_MODEL).", retryable=False)
    day = trip.days[day_index]
    w = WorkingDay(trip=trip, day=day, activities=list(day.activities), start_min=day.start_min, buffer_min=day.buffer_min)
    # LangChain v1's create_agent is the LangGraph ReAct agent (successor of langgraph.prebuilt.create_react_agent).
    agent = create_agent(services.llm, build_tools(w, dest, services), system_prompt=SYSTEM_PROMPT)
    request = f"Traveler request for day {day_index + 1} in {trip.destination}: {instruction.strip()}"
    try:
        async with asyncio.timeout(AGENT_TIMEOUT_S):
            await agent.ainvoke({"messages": [HumanMessage(request)]}, {"recursion_limit": AGENT_RECURSION_LIMIT})
    except TimeoutError as e:
        raise PlanningError("That change took too long to work out. Try a simpler request.") from e
    except Exception as e:  # noqa: BLE001 - surface agent failures as a retryable planning error
        log.warning("Adjust agent failed: %s", e)
        raise PlanningError("We couldn't work out that change. Try rephrasing it.") from e

    proposed = await finish(w.as_day(), trip, services)
    changes = diff_days(day, proposed)
    if not changes:
        return Proposal(day=day, changes=[])
    old_ids = {a.id for a in day.activities}
    new_id = next((a.id for a in proposed.activities if a.id not in old_ids), None)
    return Proposal(day=proposed, changes=changes, new_id=new_id)
