from typing import Annotated

from pydantic import ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel

from app.contracts.base import ApiModel
from app.contracts.travel import Preferences

DEFAULT_PREFS = Preferences(
    pace="balanced",
    interests=["food", "culture", "nature"],
    food=["local-classics", "street-food"],
    transport="transit",
    budget="moderate",
)


class Stats(ApiModel):
    trips: int
    days_planned: int
    countries: int


class Me(ApiModel):
    id: str
    name: str
    home: str
    traveling_since: int | None = None
    initials: str
    stats: Stats


class ProfilePatch(ApiModel):
    """Partial update of the app-owned name and home. Omitted fields stay as they are."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    name: Annotated[str, Field(min_length=1, max_length=120)] | None = None
    home: Annotated[str, Field(max_length=120)] | None = None

    @field_validator("name", "home", mode="before")
    @classmethod
    def strip_text(cls, value: object) -> object:
        if value is None:
            raise ValueError("must not be null")
        if not isinstance(value, str):
            raise ValueError("must be a string")
        return value.strip()
