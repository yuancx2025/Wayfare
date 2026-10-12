from app.contracts.base import ApiModel


class ResolveRequest(ApiModel):
    place_id: str
