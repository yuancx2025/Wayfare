from typing import Literal

from app.contracts.travel import LegMode


class EstimateTravelRouter:
    """No real travel times: the scheduler falls back to its distance-based estimates."""

    source: Literal["estimate"] = "estimate"

    async def pair_times(self, pairs, mode: LegMode) -> list[tuple[int, float] | None]:
        return [None] * len(pairs)

    async def leg_polyline(self, a, b, mode: LegMode) -> str | None:
        return None
