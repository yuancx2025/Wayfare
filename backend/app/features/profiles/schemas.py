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
