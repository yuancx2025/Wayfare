import asyncio
import logging
from collections import defaultdict

from app.contracts.travel import Day, LegMode, Transport
from app.core.exceptions import UpstreamError
from app.domain.scheduler import LegTable, needed_legs
from app.integrations.routing.protocol import TravelRouter

log = logging.getLogger(__name__)


async def resolve_legs(days: list[Day], transport: Transport, router: TravelRouter, known: LegTable | None = None) -> LegTable:
    """Fetch real travel times for consecutive stop pairs not already in `known`; anything that fails stays an estimate."""
    table = LegTable(dict(known.known) if known else {})
    if router.source == "estimate":
        return table
    by_mode: dict[LegMode, dict[tuple[str, str], tuple]] = defaultdict(dict)
    for day in days:
        for a, b, mode in needed_legs(day, transport):
            if (a.place_id, b.place_id, mode) not in table.known:
                by_mode[mode].setdefault((a.place_id, b.place_id), (a, b))

    async def run(mode: LegMode, pairs: list[tuple]):
        try:
            return mode, pairs, await router.pair_times(pairs, mode)
        except UpstreamError as e:
            log.warning("Routes lookup failed for %s: %s", mode, e)
            return mode, pairs, [None] * len(pairs)

    for mode, pairs, times in await asyncio.gather(*(run(mode, list(pairs.values())) for mode, pairs in by_mode.items())):
        for (a, b), t in zip(pairs, times):
            if t:
                table.known[(a.place_id, b.place_id, mode)] = t
    return table
