from typing import Literal

from app.contracts.base import ApiModel
from app.contracts.travel import LegMode


class TripSummary(ApiModel):
    id: str
    destination_id: str
    destination: str
    country: str
    image: str
    start_date: str
    end_date: str
    travelers: int
    day_count: int
    stop_count: int
    adjusted: bool
    created_at: int


class RouteLeg(ApiModel):
    from_id: str
    to_id: str
    mode: LegMode
    polyline: str | None = None


class DayRoute(ApiModel):
    legs: list[RouteLeg]
    source: Literal["google", "estimate"]
