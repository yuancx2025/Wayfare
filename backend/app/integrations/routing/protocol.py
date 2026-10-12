from typing import Literal, Protocol

from app.contracts.travel import LegMode, Place


class TravelRouter(Protocol):
    source: Literal["google", "estimate"]

    async def pair_times(self, pairs: list[tuple[Place | object, Place | object]], mode: LegMode) -> list[tuple[int, float] | None]: ...
    async def leg_polyline(self, a, b, mode: LegMode) -> str | None: ...
