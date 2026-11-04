from typing import Literal

from pydantic import ConfigDict, StrictBool, model_validator

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
    is_favorite: bool = False
    visited: bool = False


class TripMetadataPatch(ApiModel):
    model_config = ConfigDict(extra="forbid")

    is_favorite: StrictBool | None = None
    visited: StrictBool | None = None

    @model_validator(mode="after")
    def require_explicit_values(self):
        if not self.model_fields_set or any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError("Provide at least one explicit metadata boolean")
        return self


class TripMetadataResult(ApiModel):
    id: str
    is_favorite: bool
    visited: bool


class RouteLeg(ApiModel):
    from_id: str
    to_id: str
    mode: LegMode
    polyline: str | None = None


class DayRoute(ApiModel):
    legs: list[RouteLeg]
    source: Literal["google", "estimate"]
