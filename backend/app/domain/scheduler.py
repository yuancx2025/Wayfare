"""Deterministic planning math, ported from `frontend/src/domain/logic/generate.ts`.

The LLM only chooses places and writes explanations; ordering, timing and travel legs are computed here.
Parity with the TypeScript implementation is covered by `tests/test_scheduler_parity.py`.
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Protocol

from app.contracts.travel import Activity, Day, Destination, Leg, LegMode, OpenWindow, Place, Preferences, Slot, Transport, Trip

EARTH_RADIUS_KM = 6371
STREET_FACTOR = 1.3

INTEREST_LABEL = {
    "food": "Food", "culture": "Culture", "nature": "Nature", "museums": "Museums",
    "shopping": "Shopping", "architecture": "Architecture", "nightlife": "Nightlife",
}
FOOD_LABEL = {
    "local-classics": "Local classics", "street-food": "Street food", "seafood": "Seafood",
    "vegetarian": "Vegetarian", "cafes": "Cafés", "fine-dining": "Fine dining",
}
TRANSPORT_LABEL = {"walking": "Walking", "transit": "Public transit", "driving": "Driving", "mix": "A mix"}
PACE_LABEL = {"relaxed": "Relaxed", "balanced": "Balanced", "packed": "Packed"}
LEG_LABEL: dict[str, str] = {"walk": "Walk", "transit": "Transit", "drive": "Drive"}

THEMES = {
    "culture": "History & landmarks", "nature": "Gardens & green space", "museums": "Art & museums",
    "shopping": "Markets & neighborhoods", "architecture": "Skylines & design", "nightlife": "Evening alleys",
    "food": "A day of tasting",
}

SIGHTS_PER_DAY = {"relaxed": 2, "balanced": 3, "packed": 4}
DAY_START_MIN = {"relaxed": 600, "balanced": 555, "packed": 510}
DAY_BUFFER_MIN = {"relaxed": 25, "balanced": 15, "packed": 5}
SLOT_FLOOR: dict[str, int] = {"lunch": 12 * 60, "dinner": 18 * 60 + 30, "evening": 19 * 60 + 30}


class HasLatLng(Protocol):
    lat: float
    lng: float


def js_round(x: float) -> int:
    """`Math.round`: halves round up, unlike Python's banker's rounding."""
    return math.floor(x + 0.5)


def round5(n: float) -> int:
    return max(5, js_round(n / 5) * 5)


def distance_km(a: HasLatLng, b: HasLatLng) -> float:
    to_rad = lambda x: (x * math.pi) / 180  # noqa: E731
    d_lat, d_lng = to_rad(b.lat - a.lat), to_rad(b.lng - a.lng)
    h = math.sin(d_lat / 2) ** 2 + math.cos(to_rad(a.lat)) * math.cos(to_rad(b.lat)) * math.sin(d_lng / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(h))


def leg_mode(km: float, transport: Transport, walk_cap_min: int | None) -> LegMode:
    if transport == "driving":
        mode: LegMode = "walk" if km < 0.6 else "drive"
    elif transport == "walking":
        mode = "walk" if km < 2.5 else "transit"
    elif transport == "transit":
        mode = "walk" if km < 0.9 else "transit"
    else:
        mode = "walk" if km < 1.4 else "transit"
    if mode == "walk" and walk_cap_min is not None and km * 12 > walk_cap_min:
        mode = "drive" if transport == "driving" else "transit"
    return mode


def leg_between(a: HasLatLng, b: HasLatLng, transport: Transport, walk_cap_min: int | None = None) -> Leg:
    """Haversine estimate. Also decides the travel mode used when asking the Routes API."""
    km = distance_km(a, b) * STREET_FACTOR
    mode = leg_mode(km, transport, walk_cap_min)
    raw = km * 12 if mode == "walk" else 8 + km * 2.6 if mode == "transit" else 6 + km * 2.2
    return Leg(mode=mode, minutes=round5(raw), km=js_round(km * 10) / 10, source="estimate")


@dataclass
class LegTable:
    """Real travel times keyed by (from place id, to place id, mode). Missing pairs fall back to estimates."""

    known: dict[tuple[str, str, str], tuple[int, float]] = field(default_factory=dict)

    def leg(self, a: Activity, b: Activity, transport: Transport, walk_cap_min: int | None) -> Leg:
        est = leg_between(a, b, transport, walk_cap_min)
        hit = self.known.get((a.place_id, b.place_id, est.mode))
        if not hit:
            return est
        minutes, km = hit
        return Leg(mode=est.mode, minutes=max(1, minutes), km=km, source="google")


def needed_legs(day: Day, transport: Transport) -> list[tuple[Activity, Activity, LegMode]]:
    acts = day.activities
    return [
        (acts[i - 1], acts[i], leg_between(acts[i - 1], acts[i], transport, day.walk_cap_min).mode)
        for i in range(1, len(acts))
    ]


def retime_day(day: Day, prefs: Preferences, legs: LegTable | None = None) -> Day:
    """Recompute travel legs and start times. Used after generation and every adjustment."""
    table = legs or LegTable()
    t = day.start_min
    out: list[Activity] = []
    for i, a in enumerate(day.activities):
        leg_in = None
        if i > 0:
            leg_in = table.leg(day.activities[i - 1], a, prefs.transport, day.walk_cap_min)
            t += leg_in.minutes + day.buffer_min
        floor = SLOT_FLOOR.get(a.slot) if a.slot else None
        if floor and t < floor:
            t = floor
        start = math.ceil(t / 5) * 5
        t = start + a.duration_min
        out.append(a.model_copy(update={"start_min": start, "leg_in": leg_in}))
    return day.model_copy(update={"activities": out})


def score_place(pl: Place, prefs: Preferences) -> float:
    s = 0.0
    if pl.category != "food" and pl.category in prefs.interests:
        s += 3
    if pl.food and any(f in prefs.food for f in pl.food):
        s += 3
    if pl.price:
        if prefs.budget == "budget":
            s -= (pl.price - 1) * 1.5
        if prefs.budget == "premium":
            s += (pl.price - 1) * 0.8
        if prefs.budget == "moderate" and pl.price == 3:
            s -= 1
    return s


def why_for(pl: Place, prefs: Preferences, slot: Slot | None = None) -> str:
    reasons: list[str] = []
    if pl.category != "food" and pl.category in prefs.interests:
        reasons.append(f"You picked {INTEREST_LABEL[pl.category].lower()}")
    food = next((f for f in (pl.food or []) if f in prefs.food), None)
    if food:
        reasons.append(f"matches your taste for {FOOD_LABEL[food].lower()}")
    if pl.price == 1 and prefs.budget == "budget":
        reasons.append("easy on a budget")
    if pl.price == 3 and prefs.budget == "premium":
        reasons.append("a premium pick for your budget")
    if slot == "lunch":
        reasons.append("timed as a midday break")
    if slot == "evening":
        reasons.append("best after dark")
    if prefs.pace == "relaxed" and pl.category != "food":
        reasons.append("unhurried visit for a relaxed pace")
    if not reasons:
        reasons.append(f"rounds out the day near {pl.area}")
    text = ", ".join(reasons[:2])
    return text[0].upper() + text[1:] + "."


def duration_for(pl: Place, prefs: Preferences) -> int:
    factor = 1 if pl.category == "food" else 1.2 if prefs.pace == "relaxed" else 0.85 if prefs.pace == "packed" else 1
    return round5(pl.duration_min * factor)


def activity_id(trip_id: str, day_index: int, place_id: str) -> str:
    return f"{trip_id}-d{day_index}-{place_id}"


def to_activity(trip_id: str, day_index: int, pl: Place, prefs: Preferences, slot: Slot | None = None, why: str | None = None) -> Activity:
    return Activity(
        id=activity_id(trip_id, day_index, pl.id), place_id=pl.id, name=pl.name, category=pl.category, area=pl.area,
        lat=pl.lat, lng=pl.lng, start_min=0, duration_min=duration_for(pl, prefs), description=pl.description,
        why=why or why_for(pl, prefs, slot), slot=slot,
    )


def _rank_keys(keys: list[str]) -> list[str]:
    counts: dict[str, int] = {}
    for k in keys:
        counts[k] = counts.get(k, 0) + 1
    return sorted(counts, key=lambda k: -counts[k])


def describe_day(activities: list[Activity]) -> tuple[str, str]:
    """Returns (theme, areas)."""
    sights = [a for a in activities if a.category != "food"]
    cats = _rank_keys([a.category for a in (sights or activities)])
    cat = cats[0] if cats else "food"
    return THEMES[cat], " & ".join(_rank_keys([a.area for a in activities])[:2])


def nearest_neighbor[T: HasLatLng](items: list[T]) -> list[T]:
    if len(items) < 3:
        return items
    rest = list(items)
    out = [rest.pop(0)]
    while rest:
        last = out[-1]
        bi = 0
        for i, r in enumerate(rest):
            if distance_km(last, r) < distance_km(last, rest[bi]):
                bi = i
        out.append(rest.pop(bi))
    return out


def is_open_during(hours: list[OpenWindow] | None, iso_date: str, start_min: int, duration_min: int) -> bool | None:
    """None when hours are unknown."""
    if hours is None:
        return None
    g_day = (date.fromisoformat(iso_date).weekday() + 1) % 7
    prev_day = (g_day + 6) % 7
    end = start_min + duration_min
    for w in hours:
        if w.day == g_day and w.open_min <= start_min and end <= w.close_min:
            return True
        if w.day == prev_day and w.close_min > 1440 and end + 1440 <= w.close_min and w.open_min <= start_min + 1440:
            return True
    return False


def open_on_day(hours: list[OpenWindow] | None, iso_date: str) -> bool:
    if hours is None:
        return True
    g_day = (date.fromisoformat(iso_date).weekday() + 1) % 7
    return any(w.day == g_day for w in hours)


# --- Curation + scheduling -------------------------------------------------------------------------------------


@dataclass
class PlannedStop:
    place: Place
    slot: Slot | None = None
    why: str | None = None


@dataclass
class PlannedDay:
    stops: list[PlannedStop]
    theme: str | None = None


def wants_dinner(prefs: Preferences) -> bool:
    return prefs.pace == "packed" or (prefs.pace == "balanced" and "food" in prefs.interests)


def heuristic_curate(places: list[Place], center: HasLatLng, n_days: int, prefs: Preferences) -> list[PlannedDay]:
    """The original rule-based selection from `buildTrip`. Used when no LLM is configured and as a fallback."""
    per_day = SIGHTS_PER_DAY[prefs.pace]

    def by_score(items: list[Place]) -> list[Place]:
        scored = [(pl, score_place(pl, prefs) - i * 0.001) for i, pl in enumerate(items)]
        return [pl for pl, _ in sorted(scored, key=lambda x: x[1], reverse=True)]

    sights = by_score([p for p in places if p.category != "food"])[: n_days * per_day]
    foods = by_score([p for p in places if p.category == "food"])
    sights.sort(key=lambda p: math.atan2(p.lat - center.lat, p.lng - center.lng))

    used_food: set[str] = set()
    days: list[PlannedDay] = []
    cursor = 0
    for d in range(n_days):
        size = len(sights) // n_days + (1 if d < len(sights) % n_days else 0)
        group = sights[cursor : cursor + size]
        cursor += size
        if group:
            centroid: HasLatLng = _Point(sum(g.lat for g in group) / len(group), sum(g.lng for g in group) / len(group))
        else:
            centroid = center

        def pick_food(meal: bool) -> Place | None:
            pool = [f for f in foods if f.id not in used_food and (not meal or any(x != "cafes" for x in (f.food or [])))]
            ranked = sorted(pool, key=lambda f: score_place(f, prefs) - distance_km(centroid, f) * 0.8, reverse=True)
            best = ranked[0] if ranked else None
            if best:
                used_food.add(best.id)
            return best

        stops = [PlannedStop(p, "evening" if p.category == "nightlife" else None) for p in group]
        lunch = pick_food(True)
        if lunch:
            stops.append(PlannedStop(lunch, "lunch"))
        if wants_dinner(prefs):
            dinner = pick_food(True)
            if dinner:
                stops.append(PlannedStop(dinner, "dinner"))
        days.append(PlannedDay(stops))
    return days


@dataclass
class _Point:
    lat: float
    lng: float


def schedule_day(trip_id: str, index: int, iso_date: str, planned: PlannedDay, prefs: Preferences) -> Day:
    """Orders a day's stops (daytime by nearest neighbour, lunch mid-day, dinner then evening last). Untimed."""
    is_evening = lambda s: s.slot == "evening" or (s.slot is None and s.place.category == "nightlife")  # noqa: E731
    evening = [s for s in planned.stops if is_evening(s)]
    daytime = nearest_neighbor([s.place for s in planned.stops if s.slot in (None, "snack") and not is_evening(s)])
    by_id = {s.place.id: s for s in planned.stops}
    lunch = next((s for s in planned.stops if s.slot == "lunch"), None)
    dinner = next((s for s in planned.stops if s.slot == "dinner"), None)

    acts = [to_activity(trip_id, index, p, prefs, by_id[p.id].slot, by_id[p.id].why) for p in daytime]
    if lunch:
        acts.insert(math.ceil(len(acts) / 2), to_activity(trip_id, index, lunch.place, prefs, "lunch", lunch.why))
    if dinner:
        acts.append(to_activity(trip_id, index, dinner.place, prefs, "dinner", dinner.why))
    for s in evening:
        acts.append(to_activity(trip_id, index, s.place, prefs, "evening", s.why))

    theme, areas = describe_day(acts)
    return Day(
        index=index, date=iso_date, theme=planned.theme or theme, areas=areas,
        start_min=DAY_START_MIN[prefs.pace], buffer_min=DAY_BUFFER_MIN[prefs.pace], activities=acts,
    )


def add_days(iso: str, n: int) -> str:
    return (date.fromisoformat(iso) + timedelta(days=n)).isoformat()


def days_between(a: str, b: str) -> int:
    return (date.fromisoformat(b) - date.fromisoformat(a)).days


def assemble_trip(trip_id: str, dest: Destination, start_date: str, end_date: str, travelers: int, prefs: Preferences, days: list[Day]) -> Trip:
    return Trip(
        id=trip_id, destination_id=dest.id, destination=dest.name, country=dest.country, image=dest.image,
        start_date=start_date, end_date=end_date, travelers=travelers, prefs=prefs, days=days,
        adjusted=False, created_at=int(time.time() * 1000),
    )


def build_trip_heuristic(trip_id: str, dest: Destination, places: list[Place], start_date: str, end_date: str, travelers: int, prefs: Preferences) -> Trip:
    """Offline equivalent of `buildTrip`: heuristic curation + scheduling + estimated legs."""
    n = days_between(start_date, end_date) + 1
    planned = heuristic_curate(places, dest.center, n, prefs)
    days = [retime_day(schedule_day(trip_id, d, add_days(start_date, d), planned[d], prefs), prefs) for d in range(n)]
    return assemble_trip(trip_id, dest, start_date, end_date, travelers, prefs, days)
