from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class ApiModel(BaseModel):
    """camelCase JSON with optional fields omitted when empty, matching `frontend/src/domain/types.ts`."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")

    def dump(self) -> dict:
        return self.model_dump(mode="json", by_alias=True, exclude_none=True)
