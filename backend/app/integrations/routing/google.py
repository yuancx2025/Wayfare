from typing import Literal

from app.contracts.travel import LegMode
from app.integrations.cache import PlaceCache, cache_key
from app.integrations.routing.google_client import GoogleRoutesClient


class GoogleTravelRouter:
    source: Literal["google"] = "google"

    def __init__(self, client: GoogleRoutesClient, cache: PlaceCache):
        self._g = client
        self._cache = cache

    async def pair_times(self, pairs, mode: LegMode) -> list[tuple[int, float] | None]:
        key = cache_key("matrix", mode, [(round(a.lat, 5), round(a.lng, 5), round(b.lat, 5), round(b.lng, 5)) for a, b in pairs])
        hit = await self._cache.get(key)
        if hit is not None:
            return [tuple(x) if x else None for x in hit]
        out = await self._g.pair_times(pairs, mode)
        await self._cache.set(key, [list(x) if x else None for x in out])
        return out

    async def leg_polyline(self, a, b, mode: LegMode) -> str | None:
        key = cache_key("poly", mode, round(a.lat, 5), round(a.lng, 5), round(b.lat, 5), round(b.lng, 5))
        hit = await self._cache.get(key)
        if hit is not None:
            return hit.get("p")
        poly = await self._g.leg_polyline(a, b, mode)
        await self._cache.set(key, {"p": poly})
        return poly
