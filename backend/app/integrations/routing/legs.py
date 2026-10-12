import asyncio
import logging
from collections import defaultdict

from app.contracts.travel import Day, LegMode, Transport
from app.core.exceptions import UpstreamError
from app.domain.scheduler import LegTable, needed_legs
from app.integrations.routing.protocol import TravelRouter

log = logging.getLogger(__name__)

MATRIX_CHUNK = 10  # TRANSIT matrices are capped at 100 elements; pairs are read off the diagonal.


async def resolve_legs(days: list[Day], transport: Transport, router: TravelRouter) -> LegTable:
    """Fetch real travel times for every consecutive stop pair; anything that fails stays an estimate."""
    by_mode: dict[LegMode, list[tuple]] = defaultdict(list)
    for day in days:
        for a, b, mode in needed_legs(day, transport):
            by_mode[mode].append((a, b))
    table = LegTable()
    if router.source == "estimate":
        return table

    async def run(mode: LegMode, chunk: list[tuple]):
        try:
            return mode, chunk, await router.pair_times(chunk, mode)
        except UpstreamError as e:
            log.warning("Routes matrix failed for %s: %s", mode, e)
            return mode, chunk, [None] * len(chunk)

    jobs = [run(mode, pairs[i : i + MATRIX_CHUNK]) for mode, pairs in by_mode.items() for i in range(0, len(pairs), MATRIX_CHUNK)]
    for mode, chunk, times in await asyncio.gather(*jobs):
        for (a, b), t in zip(chunk, times):
            if t:
                table.known[(a.place_id, b.place_id, mode)] = t
    return table
