from typing import Literal

from pydantic import Field, model_validator

from app.contracts.base import ApiModel
from app.contracts.travel import Day

AdjustKind = Literal["relaxed", "less-walking", "more-food", "replace", "custom"]


class Change(ApiModel):
    type: Literal["added", "removed", "changed"]
    text: str


class Proposal(ApiModel):
    proposal_id: str | None = None
    day: Day
    changes: list[Change]
    replaced_id: str | None = None
    new_id: str | None = None


class ProposalRequest(ApiModel):
    kind: AdjustKind
    activity_id: str | None = None
    place_id: str | None = None
    instruction: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def _check(self) -> "ProposalRequest":
        if self.kind == "replace" and not (self.activity_id and self.place_id):
            raise ValueError("replace needs activityId and placeId")
        if self.kind == "custom" and not (self.instruction and self.instruction.strip()):
            raise ValueError("custom needs an instruction")
        return self
