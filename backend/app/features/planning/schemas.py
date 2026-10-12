from datetime import date

from pydantic import Field, model_validator

from app.contracts.base import ApiModel
from app.contracts.travel import Preferences

MAX_TRIP_DAYS = 10


class TripDraft(ApiModel):
    destination: str = Field(min_length=1)
    destination_id: str | None = None
    start_date: date
    end_date: date
    travelers: int = Field(default=2, ge=1, le=12)
    prefs: Preferences

    @model_validator(mode="after")
    def _check(self) -> "TripDraft":
        if self.start_date < date.today():
            raise ValueError("Start date is in the past")
        if self.end_date < self.start_date:
            raise ValueError("End date must be on or after the start")
        if self.day_count > MAX_TRIP_DAYS:
            raise ValueError(f"Keep trips to {MAX_TRIP_DAYS} days or fewer")
        if not self.prefs.interests:
            raise ValueError("Pick at least one interest")
        return self

    @property
    def day_count(self) -> int:
        return (self.end_date - self.start_date).days + 1
