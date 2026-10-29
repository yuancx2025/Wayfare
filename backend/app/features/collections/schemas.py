import re
from typing import Literal

from pydantic import ConfigDict, Field, StrictStr, field_validator

from app.contracts.base import ApiModel


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
