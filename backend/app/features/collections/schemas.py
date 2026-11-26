import re
from typing import Literal

from pydantic import ConfigDict, Field, StrictStr, field_validator

from app.contracts.base import ApiModel
from app.contracts.travel import Interest


class SavedPlaceReference(ApiModel):
    model_config = ConfigDict(extra="forbid")

    provider: Literal["catalog", "google"]
    kind: Literal["destination", "place"]
    external_id: StrictStr = Field(min_length=1)

    @field_validator("external_id")
    @classmethod
    def require_opaque_identifier(cls, value: str) -> str:
        if re.search(r"[\x00-\x20\x7f]", value):
            raise ValueError("Use the provider's external identifier")
        return value


class SavedPlace(SavedPlaceReference):
    id: str
    created_at: int


class SavedPlaceDetails(ApiModel):
    reference: SavedPlaceReference
    name: str
    subtitle: str
    description: str
    image: str | None = None
    rating: float | None = None
    website_uri: str | None = None
    google_maps_uri: str | None = None
    weekday_descriptions: list[str] | None = None
    destination_id: str | None = None
    best_for: list[Interest] | None = None
