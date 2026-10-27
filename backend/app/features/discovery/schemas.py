from typing import Literal

from pydantic import Field

from app.contracts.base import ApiModel
from app.contracts.travel import Category, Place

NearbyCategory = Literal["food", "attractions", "all"]

NEARBY_CATEGORIES: dict[NearbyCategory, list[Category]] = {
    "food": ["food"],
    "attractions": ["culture", "museums", "nature", "architecture"],
    "all": ["food", "culture", "museums", "nature", "architecture", "shopping", "nightlife"],
}
DEFAULT_NEARBY_RADIUS_M = 2000
MAX_NEARBY_RADIUS_M = 30000
MAX_NEARBY_RESULTS = 20


class ResolveRequest(ApiModel):
    place_id: str


class NearbyRequest(ApiModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    radius_m: int = Field(default=DEFAULT_NEARBY_RADIUS_M, ge=100, le=MAX_NEARBY_RADIUS_M)
    category: NearbyCategory = "all"


class NearbyPlace(ApiModel):
    place: Place
    distance_m: int  # straight-line, not a walking route


class NearbyResults(ApiModel):
    source: Literal["catalog", "google"]
    places: list[NearbyPlace]
