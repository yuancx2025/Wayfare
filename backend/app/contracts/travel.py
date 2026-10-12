"""Travel value objects shared across features. JSON shapes match `frontend/src/domain/types.ts`."""

from typing import Literal

from pydantic import Field

from app.contracts.base import ApiModel

Pace = Literal["relaxed", "balanced", "packed"]
Interest = Literal["food", "culture", "nature", "museums", "shopping", "nightlife", "architecture"]
FoodPref = Literal["local-classics", "street-food", "seafood", "vegetarian", "cafes", "fine-dining"]
Transport = Literal["walking", "transit", "driving", "mix"]
Budget = Literal["budget", "moderate", "premium"]
Category = Interest
LegMode = Literal["walk", "transit", "drive"]
Slot = Literal["lunch", "dinner", "snack", "evening"]


class LatLng(ApiModel):
    lat: float
    lng: float


class Viewport(ApiModel):
    low: LatLng
    high: LatLng


class Preferences(ApiModel):
    pace: Pace
    interests: list[Interest]
    food: list[FoodPref]
    transport: Transport
    budget: Budget


class OpenWindow(ApiModel):
    """One opening window. `day` is 0=Sunday (Google's convention); minutes may exceed 1440 past midnight."""

    day: int = Field(ge=0, le=6)
    open_min: int
    close_min: int


class Place(ApiModel):
    id: str
    name: str
    category: Category
    area: str
    lat: float
    lng: float
    duration_min: int
    description: str
    food: list[FoodPref] | None = None
    price: Literal[1, 2, 3] | None = None
    rating: float | None = None
    hours: list[OpenWindow] | None = None
    why: str | None = None


class Destination(ApiModel):
    id: str
    name: str
    country: str
    image: str
    blurb: str
    best_for: list[Interest]
    center: LatLng
    place_id: str | None = None
    viewport: Viewport | None = None


class Suggestion(ApiModel):
    place_id: str
    name: str
    secondary: str
    source: Literal["catalog", "google"]


class PlaceDetails(ApiModel):
    place_id: str
    name: str
    rating: float | None = None
    user_rating_count: int | None = None
    website_uri: str | None = None
    google_maps_uri: str | None = None
    weekday_descriptions: list[str] | None = None
    hours: list[OpenWindow] | None = None
    open_during_visit: bool | None = None
    source: Literal["catalog", "google"]


class Leg(ApiModel):
    mode: LegMode
    minutes: int
    km: float
    source: Literal["google", "estimate"] | None = None


class Activity(ApiModel):
    id: str
    place_id: str
    name: str
    category: Category
    area: str
    lat: float
    lng: float
    start_min: int
    duration_min: int
    description: str
    why: str
    slot: Slot | None = None
    leg_in: Leg | None = None


class Day(ApiModel):
    index: int
    date: str
    theme: str
    areas: str
    start_min: int
    buffer_min: int
    walk_cap_min: int | None = None
    activities: list[Activity]


class Trip(ApiModel):
    id: str
    destination_id: str
    destination: str
    country: str
    image: str
    start_date: str
    end_date: str
    travelers: int
    prefs: Preferences
    days: list[Day]
    adjusted: bool = False
    created_at: int
    version: int = 1
