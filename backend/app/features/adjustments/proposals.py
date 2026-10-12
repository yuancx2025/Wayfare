"""Previewable day adjustments, ported from `frontend/src/domain/logic/adjust.ts`.

Each function returns a proposed Day plus a human-readable diff; nothing is persisted here.
"""

from __future__ import annotations

from app.contracts.travel import Activity, Day, Destination, Place, Trip
from app.domain.scheduler import LEG_LABEL, describe_day, distance_km, js_round, retime_day, score_place, to_activity
from app.features.adjustments.explanations import write_whys
from app.features.adjustments.schemas import Change, Proposal
from app.integrations.routing.legs import resolve_legs
from app.integrations.services import Services

MORE_FOOD_RADIUS_M = 800
REPLACE_RADIUS_M = 1500
WIDE_RADIUS_M = 3000


def fmt_time(minutes: int) -> str:
    h, m = (minutes // 60) % 24, minutes % 60
    return f"{((h + 11) % 12) + 1}:{m:02d} {'AM' if h < 12 else 'PM'}"


async def finish(day: Day, trip: Trip, services: Services) -> Day:
    """Re-time with fresh legs. Keeps an LLM-written theme unless the original day had the generic one."""
    original = trip.days[day.index]
    table = await resolve_legs([day], trip.prefs.transport, services.router)
    timed = retime_day(day, trip.prefs, table)
    generic_theme, _ = describe_day(original.activities)
    theme, areas = describe_day(timed.activities)
    return timed.model_copy(update={"theme": theme if original.theme == generic_theme else original.theme, "areas": areas})


def used_place_ids(trip: Trip) -> set[str]:
    return {a.place_id for d in trip.days for a in d.activities}


async def _nearby(services: Services, dest: Destination, center: Activity, categories, radius_m: float, exclude: set[str]) -> list[Place]:
    places = [p for p in await services.places.nearby(dest, (center.lat, center.lng), categories, radius_m) if p.id not in exclude]
    if not places and services.places.source == "google":
        places = [p for p in await services.places.nearby(dest, (center.lat, center.lng), categories, WIDE_RADIUS_M) if p.id not in exclude]
    return places


async def propose_relaxed(trip: Trip, day_index: int, services: Services) -> Proposal:
    day = trip.days[day_index]
    changes: list[Change] = []
    acts = list(day.activities)
    removable = [a for a in acts if not a.slot or a.slot == "evening"]
    if len(acts) > 2 and len(removable) > 1:
        # Drop the stop that costs the most travel time.
        def cost(a: Activity) -> float:
            i = acts.index(a)
            nxt = acts[i + 1] if i + 1 < len(acts) else None
            return (a.leg_in.minutes if a.leg_in else 0) + (nxt.leg_in.minutes if nxt and nxt.leg_in else 0) + a.duration_min * 0.2

        drop = sorted(removable, key=cost, reverse=True)[0]
        freed = js_round((cost(drop) + drop.duration_min * 0.8) / 5) * 5
        acts = [a for a in acts if a is not drop]
        changes.append(Change(type="removed", text=f"{drop.name} \u2014 frees about {freed} min"))
    nxt = await finish(day.model_copy(update={"activities": acts, "start_min": day.start_min + 30, "buffer_min": day.buffer_min + 15}), trip, services)
    changes.append(Change(type="changed", text=f"Start later: {fmt_time(day.start_min)} \u2192 {fmt_time(nxt.start_min)}"))
    changes.append(Change(type="changed", text="Extra 15 min of breathing room between stops"))
    return Proposal(day=nxt, changes=changes)


async def propose_less_walking(trip: Trip, day_index: int, services: Services) -> Proposal:
    day = trip.days[day_index]
    nxt = await finish(day.model_copy(update={"walk_cap_min": 8}), trip, services)
    before = {a.id: a.leg_in for a in day.activities}
    changes = [
        Change(type="changed", text=f"To {a.name}: {LEG_LABEL[b.mode]} ~{b.minutes} min \u2192 {LEG_LABEL[a.leg_in.mode]} ~{a.leg_in.minutes} min")
        for a in nxt.activities
        if (b := before.get(a.id)) and a.leg_in and b.mode != a.leg_in.mode
    ]
    if not changes:
        return Proposal(day=day, changes=[])
    return Proposal(day=nxt, changes=changes)


async def propose_more_food(trip: Trip, day_index: int, dest: Destination, services: Services) -> Proposal:
    """Add an afternoon tasting stop close to the middle of the day."""
    day = trip.days[day_index]
    acts = day.activities
    late_idx = next((i for i, a in enumerate(acts) if a.slot in ("dinner", "evening")), -1)
    mid = late_idx if late_idx >= 0 else len(acts)
    if not acts:
        return Proposal(day=day, changes=[])
    anchor = acts[mid - 1] if mid - 1 >= 0 else acts[0]
    snack_bonus = lambda pl: 2 if pl.food and any(f in ("cafes", "street-food") for f in pl.food) else 0  # noqa: E731
    rank = lambda pl: score_place(pl, trip.prefs) + snack_bonus(pl) - distance_km(anchor, pl)  # noqa: E731
    candidates = await _nearby(services, dest, anchor, ["food"], MORE_FOOD_RADIUS_M, used_place_ids(trip))
    if not candidates:
        return Proposal(day=day, changes=[])
    pick = sorted(candidates, key=rank, reverse=True)[0]
    why = (await write_whys(services.llm, trip.prefs, [pick], f"an afternoon tasting stop near {anchor.name}")).get(pick.id)
    snack = to_activity(trip.id, day_index, pick, trip.prefs, "snack", why)
    snack = snack.model_copy(update={"duration_min": min(45, pick.duration_min)})
    new_acts = list(acts)
    new_acts.insert(mid, snack)
    nxt = await finish(day.model_copy(update={"activities": new_acts}), trip, services)
    placed = next(a for a in nxt.activities if a.id == snack.id)
    changes = [Change(type="added", text=f"{pick.name} at {fmt_time(placed.start_min)} \u2014 {pick.description}")]
    later, prev_last = nxt.activities[-1], acts[-1]
    if later.start_min != prev_last.start_min:
        changes.append(Change(type="changed", text=f"Later stops shift by ~{later.start_min - prev_last.start_min} min"))
    return Proposal(day=nxt, changes=changes, new_id=snack.id)


async def replacement_candidates(trip: Trip, day_index: int, activity_id: str, dest: Destination, services: Services, limit: int = 3) -> list[Place]:
    target = next((a for a in trip.days[day_index].activities if a.id == activity_id), None)
    if target is None:
        return []
    is_food = target.category == "food"
    used = used_place_ids(trip)
    pool = [p for p in await _nearby(services, dest, target, ["food"] if is_food else None, REPLACE_RADIUS_M, used) if (p.category == "food") == is_food]
    if not pool:
        pool = await _nearby(services, dest, target, None if is_food else ["food"], REPLACE_RADIUS_M, used)
    rank = lambda pl: score_place(pl, trip.prefs) + (2 if pl.category == target.category else 0) - distance_km(target, pl) * 0.6  # noqa: E731
    top = sorted(pool, key=rank, reverse=True)[:limit]
    whys = await write_whys(services.llm, trip.prefs, top, f"alternatives to {target.name} ({target.category}) on day {day_index + 1}")
    return [p.model_copy(update={"why": whys.get(p.id)}) for p in top]


async def propose_replacement(trip: Trip, day_index: int, activity_id: str, place: Place, services: Services) -> Proposal:
    day = trip.days[day_index]
    target = next(a for a in day.activities if a.id == activity_id)
    replacement = to_activity(trip.id, day_index, place, trip.prefs, target.slot, place.why)
    nxt = await finish(day.model_copy(update={"activities": [replacement if a.id == activity_id else a for a in day.activities]}), trip, services)
    placed = next(a for a in nxt.activities if a.id == replacement.id)
    return Proposal(
        day=nxt, replaced_id=activity_id, new_id=replacement.id,
        changes=[
            Change(type="removed", text=target.name),
            Change(type="added", text=f"{place.name} at {fmt_time(placed.start_min)} \u2014 {place.description}"),
        ],
    )


def diff_days(before: Day, after: Day) -> list[Change]:
    """Generic diff used for free-text (agent) adjustments."""
    old = {a.id: a for a in before.activities}
    new = {a.id: a for a in after.activities}
    changes = [Change(type="removed", text=a.name) for i, a in old.items() if i not in new]
    changes += [Change(type="added", text=f"{a.name} at {fmt_time(a.start_min)} \u2014 {a.description}") for i, a in new.items() if i not in old]
    moved = [a for i, a in new.items() if i in old and old[i].start_min != a.start_min]
    if moved:
        changes.append(Change(type="changed", text=f"{len(moved)} stop{'s' if len(moved) != 1 else ''} re-timed"))
    if before.start_min != after.start_min:
        changes.append(Change(type="changed", text=f"Start: {fmt_time(before.start_min)} \u2192 {fmt_time(after.start_min)}"))
    return changes
