"""Travel router backed by the Routes API: one computeRoutes request per leg, cached per leg in `place_cache`."""

import asyncio
import logging
from typing import Literal

import httpx

from app.contracts.travel import LegMode
from app.core.exceptions import UpstreamError
from app.integrations.cache import PlaceCache, cache_key
from app.integrations.routing.google_client import GoogleRoutesClient

log = logging.getLogger(__name__)

MAX_CONCURRENT_LEGS = 8


def _leg_key(a, b, mode: LegMode) -> str:
    return cache_key("leg", mode, round(a.lat, 5), round(a.lng, 5), round(b.lat, 5), round(b.lng, 5))


class GoogleTravelRouter:
    source: Literal["google"] = "google"

    def __init__(self, client: GoogleRoutesClient, cache: PlaceCache):
        self._g = client
        self._cache = cache

    async def _fetch(self, a, b, mode: LegMode) -> dict:
        """One leg as a cache payload. An empty dict records that Google found no route."""
        leg = await self._g.leg(a, b, mode)
        return {"m": leg.minutes, "km": leg.km, "p": leg.polyline} if leg else {}

    async def pair_times(self, pairs, mode: LegMode) -> list[tuple[int, float] | None]:
        """(minutes, km) per pair. Cached legs cost nothing; a failed leg stays None so the scheduler estimates it."""
        keys = [_leg_key(a, b, mode) for a, b in pairs]
        cached = await self._cache.get_many(list(set(keys)))
        missing = {key: pair for key, pair in zip(keys, pairs) if key not in cached}
        gate = asyncio.Semaphore(MAX_CONCURRENT_LEGS)

        async def fetch(key: str, a, b) -> tuple[str, dict | None]:
            async with gate:
                try:
                    return key, await self._fetch(a, b, mode)
                except (UpstreamError, httpx.HTTPError) as e:
                    log.warning("Routes leg failed for %s: %s", mode, e)
                    return key, None

        fetched = dict(await asyncio.gather(*(fetch(key, a, b) for key, (a, b) in missing.items())))
        await self._cache.set_many({key: value for key, value in fetched.items() if value is not None})
        legs = {**cached, **fetched}
        return [(leg["m"], leg["km"]) if (leg := legs[key]) else None for key in keys]

    async def leg_polyline(self, a, b, mode: LegMode) -> str | None:
        """Usually a cache hit: generation already fetched this leg, polyline included."""
        key = _leg_key(a, b, mode)
        leg = await self._cache.get(key)
        if leg is None:
            leg = await self._fetch(a, b, mode)
            await self._cache.set(key, leg)
        return leg.get("p")
