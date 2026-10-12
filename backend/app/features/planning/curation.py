"""LLM curation for trip generation: prompt, structured-output schema, and validation of the model's choice."""

from typing import Literal

from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from app.contracts.travel import Destination, Place, Preferences
from app.domain.describe import prefs_sentence, price_tag
from app.domain.scheduler import FOOD_LABEL, SIGHTS_PER_DAY, PlannedDay, PlannedStop, open_on_day, wants_dinner


class StopChoice(BaseModel):
    id: str = Field(description="Candidate id exactly as listed, e.g. c12")
    slot: Literal["lunch", "dinner", "evening"] | None = Field(
        default=None, description="lunch/dinner for the day's meals (food candidates only), evening for nightlife; otherwise null",
    )
    why: str = Field(description="One sentence (max 18 words) telling the traveler why this stop fits them")


class DayChoice(BaseModel):
    theme: str = Field(description="2-4 word title for the day, e.g. 'Art & riverside walks'")
    stops: list[StopChoice]


class TripPlanChoice(BaseModel):
    days: list[DayChoice]


CURATE_SYSTEM = """You are Wayfare's itinerary planner. You pick places for a multi-day city trip.

Rules:
- Use ONLY candidate ids from the list. Never invent places. Use each id at most once in the whole trip.
- Return exactly {n_days} days, in order.
- Each day: exactly {sights} non-food stops (sights), plus exactly one food stop with slot "lunch"{dinner_rule}.
- Nightlife candidates go in slot "evening" and count as sights.
- Group each day geographically: pick stops close to each other (compare lat,lng) so travel stays short.
- Skip a candidate on a day listed under "closed".
- Favor the traveler's interests, food styles and budget; vary themes between days.
- Write each "why" in second person, specific to the place and the traveler's preferences. No marketing fluff.
Order of stops does not matter; timing is computed afterwards."""


def candidate_line(alias: str, p: Place, dates: list[str]) -> str:
    closed = [f"day {i + 1}" for i, d in enumerate(dates) if not open_on_day(p.hours, d)]
    parts = [
        alias, p.name, p.category, p.area or "-", f"{p.lat:.4f},{p.lng:.4f}", price_tag(p),
        f"rating {p.rating}" if p.rating else "",
        ("food: " + ", ".join(FOOD_LABEL[f] for f in p.food)) if p.food else "",
        ("closed: " + ", ".join(closed)) if closed else "",
        (p.description[:90] if p.description else ""),
    ]
    return " | ".join(x for x in parts if x)


def curate_messages(dest: Destination, prefs: Preferences, dates: list[str], travelers: int, aliases: dict[str, Place], feedback: list[str] | None = None) -> list[BaseMessage]:
    system = CURATE_SYSTEM.format(
        n_days=len(dates), sights=SIGHTS_PER_DAY[prefs.pace],
        dinner_rule=' and one food stop with slot "dinner"' if wants_dinner(prefs) else "",
    )
    lines = "\n".join(candidate_line(a, p, dates) for a, p in aliases.items())
    human = (
        f"Destination: {dest.name}, {dest.country}\n"
        f"Dates: {dates[0]} to {dates[-1]} ({len(dates)} days), {travelers} traveler(s)\n"
        f"Traveler: {prefs_sentence(prefs)}\n\n"
        f"Candidates (id | name | category | area | lat,lng | price | ...):\n{lines}"
    )
    msgs: list[BaseMessage] = [SystemMessage(system), HumanMessage(human)]
    if feedback:
        msgs.append(HumanMessage("Your previous plan had problems:\n- " + "\n- ".join(feedback) + "\nReturn a corrected full plan."))
    return msgs


def validate_choice(choice: TripPlanChoice | None, aliases: dict[str, Place], dates: list[str], prefs: Preferences) -> tuple[list[str], list[PlannedDay]]:
    if choice is None:
        return ["No plan returned."], []
    errors: list[str] = []
    if len(choice.days) != len(dates):
        errors.append(f"Return exactly {len(dates)} days (got {len(choice.days)}).")
    n_sights = sum(1 for p in aliases.values() if p.category != "food")
    n_foods = len(aliases) - n_sights
    target = min(SIGHTS_PER_DAY[prefs.pace], max(1, n_sights // len(dates)))
    meals_needed = n_foods >= len(dates)

    used: set[str] = set()
    plan: list[PlannedDay] = []
    for d, day in enumerate(choice.days[: len(dates)]):
        stops: list[PlannedStop] = []
        for s in day.stops:
            p = aliases.get(s.id)
            if p is None:
                errors.append(f"Day {d + 1}: '{s.id}' is not a candidate id.")
                continue
            if s.id in used:
                errors.append(f"Day {d + 1}: '{s.id}' is used more than once.")
                continue
            used.add(s.id)
            if s.slot in ("lunch", "dinner") and p.category != "food":
                errors.append(f"Day {d + 1}: '{s.id}' is not a food place but has slot {s.slot}.")
            if not open_on_day(p.hours, dates[d]):
                errors.append(f"Day {d + 1}: '{s.id}' ({p.name}) is closed that day.")
            stops.append(PlannedStop(p, s.slot, s.why.strip() or None))
        sights = sum(1 for s in stops if s.place.category != "food")
        if abs(sights - target) > 1:
            errors.append(f"Day {d + 1}: needs {target} sights (got {sights}).")
        if meals_needed and not any(s.slot == "lunch" for s in stops):
            errors.append(f"Day {d + 1}: add one food stop with slot lunch.")
        if meals_needed and wants_dinner(prefs) and not any(s.slot == "dinner" for s in stops):
            errors.append(f"Day {d + 1}: add one food stop with slot dinner.")
        plan.append(PlannedDay(stops, day.theme.strip() or None))
    return errors, plan
