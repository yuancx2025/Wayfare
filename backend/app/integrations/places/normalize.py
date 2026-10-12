"""Maps Places API (New) responses onto the app's `Place` / `Destination` models."""

from app.contracts.travel import Category, Destination, FoodPref, Interest, LatLng, OpenWindow, Place, Viewport

FOOD_TYPES = {
    "restaurant", "cafe", "coffee_shop", "bakery", "food_court", "meal_takeaway", "bar_and_grill", "brunch_restaurant",
    "breakfast_restaurant", "fast_food_restaurant", "fine_dining_restaurant", "seafood_restaurant", "vegetarian_restaurant",
    "vegan_restaurant", "pizza_restaurant", "sandwich_shop", "dessert_shop", "ice_cream_shop", "deli", "diner",
}
TYPE_CATEGORY: dict[str, Category] = {
    "museum": "museums", "art_gallery": "museums",
    "park": "nature", "national_park": "nature", "botanical_garden": "nature", "garden": "nature", "hiking_area": "nature",
    "beach": "nature", "zoo": "nature", "state_park": "nature",
    "historical_landmark": "culture", "historical_place": "culture", "monument": "culture", "church": "culture",
    "place_of_worship": "culture", "cultural_center": "culture", "cultural_landmark": "culture", "aquarium": "culture",
    "shopping_mall": "shopping", "market": "shopping", "department_store": "shopping", "clothing_store": "shopping",
    "book_store": "shopping", "gift_shop": "shopping", "flea_market": "shopping",
    "night_club": "nightlife", "bar": "nightlife", "pub": "nightlife", "wine_bar": "nightlife", "comedy_club": "nightlife",
    "performing_arts_theater": "nightlife", "concert_hall": "nightlife", "live_music_venue": "nightlife", "karaoke": "nightlife",
    "observation_deck": "architecture", "bridge": "architecture", "skyscraper": "architecture", "plaza": "architecture",
}
TYPE_FOOD: dict[str, FoodPref] = {
    "seafood_restaurant": "seafood", "vegetarian_restaurant": "vegetarian", "vegan_restaurant": "vegetarian",
    "cafe": "cafes", "coffee_shop": "cafes", "bakery": "cafes", "fine_dining_restaurant": "fine-dining",
    "fast_food_restaurant": "street-food", "food_court": "street-food", "meal_takeaway": "street-food",
}
PRICE = {"PRICE_LEVEL_FREE": 1, "PRICE_LEVEL_INEXPENSIVE": 1, "PRICE_LEVEL_MODERATE": 2, "PRICE_LEVEL_EXPENSIVE": 3, "PRICE_LEVEL_VERY_EXPENSIVE": 3}
DEFAULT_DURATION: dict[str, int] = {"museums": 90, "nature": 60, "culture": 60, "shopping": 60, "architecture": 45, "nightlife": 90, "food": 50}
AREA_TYPES = ("neighborhood", "sublocality_level_1", "sublocality", "locality")

# Text Search queries per interest / food preference. `{city}` is filled with the destination name.
INTEREST_QUERIES: dict[Interest, str] = {
    "culture": "historic landmarks and cultural sights in {city}",
    "nature": "parks and gardens in {city}",
    "museums": "museums in {city}",
    "shopping": "markets and shopping streets in {city}",
    "nightlife": "live music and nightlife in {city}",
    "architecture": "architecture and viewpoints in {city}",
    "food": "food markets in {city}",
}
FOOD_QUERIES: dict[FoodPref, str] = {
    "local-classics": "classic local restaurants in {city}",
    "street-food": "street food in {city}",
    "seafood": "seafood restaurants in {city}",
    "vegetarian": "vegetarian restaurants in {city}",
    "cafes": "best cafes in {city}",
    "fine-dining": "fine dining restaurants in {city}",
}
# Nearby Search type filters per category.
NEARBY_TYPES: dict[Category, list[str]] = {
    "food": ["restaurant", "cafe", "bakery"],
    "museums": ["museum", "art_gallery"],
    "nature": ["park", "botanical_garden", "garden"],
    "culture": ["historical_landmark", "tourist_attraction", "cultural_landmark"],
    "shopping": ["market", "shopping_mall", "book_store"],
    "nightlife": ["bar", "night_club", "performing_arts_theater"],
    "architecture": ["observation_deck", "tourist_attraction"],
}


def _text(v: dict | None) -> str:
    return (v or {}).get("text", "")


def category_for(types: list[str], hint: Category | None) -> Category:
    if any(t in FOOD_TYPES or t.endswith("_restaurant") for t in types):
        return "food"
    if hint and hint != "food":
        return hint
    for t in types:
        if t in TYPE_CATEGORY:
            return TYPE_CATEGORY[t]
    return hint or "culture"


def area_for(g: dict) -> str:
    comps = g.get("addressComponents") or []
    for wanted in AREA_TYPES:
        for c in comps:
            if wanted in c.get("types", []):
                return c.get("shortText") or c.get("longText", "")
    return (g.get("shortFormattedAddress") or "").split(",")[0]


def hours_for(g: dict) -> list[OpenWindow] | None:
    periods = (g.get("regularOpeningHours") or {}).get("periods")
    if periods is None:
        return None
    out: list[OpenWindow] = []
    for p in periods:
        o, c = p.get("open"), p.get("close")
        if not o:
            continue
        if not c:  # open 24 hours
            return [OpenWindow(day=d, open_min=0, close_min=1440) for d in range(7)]
        open_min = o.get("hour", 0) * 60 + o.get("minute", 0)
        close_min = c.get("hour", 0) * 60 + c.get("minute", 0) + ((c.get("day", 0) - o.get("day", 0)) % 7) * 1440
        out.append(OpenWindow(day=o.get("day", 0), open_min=open_min, close_min=close_min))
    return out


def to_place(g: dict, hint: Category | None = None, food_hint: FoodPref | None = None) -> Place | None:
    loc = g.get("location")
    if not g.get("id") or not loc or g.get("businessStatus") in ("CLOSED_PERMANENTLY", "CLOSED_TEMPORARILY"):
        return None
    types = g.get("types") or []
    category = category_for(types, hint)
    food: list[FoodPref] | None = None
    if category == "food":
        tags = {TYPE_FOOD[t] for t in types if t in TYPE_FOOD}
        if food_hint:
            tags.add(food_hint)
        food = sorted(tags) or ["local-classics"]
    duration = DEFAULT_DURATION[category]
    if food == ["cafes"]:
        duration = 25
    price = PRICE.get(g.get("priceLevel", ""))
    return Place(
        id=g["id"], name=_text(g.get("displayName")) or "Unnamed place", category=category, area=area_for(g),
        lat=loc["latitude"], lng=loc["longitude"], duration_min=duration,
        description=_text(g.get("editorialSummary")) or (g.get("shortFormattedAddress") or ""),
        food=food, price=price, rating=g.get("rating"), hours=hours_for(g),
    )


def to_destination(g: dict, slug: str, image: str) -> Destination:
    comps = g.get("addressComponents") or []
    region = next((c.get("longText", "") for c in comps if "administrative_area_level_1" in c.get("types", [])), "")
    country = next((c.get("longText", "") for c in comps if "country" in c.get("types", [])), "")
    vp = g.get("viewport")
    viewport = None
    if vp:
        viewport = Viewport(
            low=LatLng(lat=vp["low"]["latitude"], lng=vp["low"]["longitude"]),
            high=LatLng(lat=vp["high"]["latitude"], lng=vp["high"]["longitude"]),
        )
    # US cities show their state (matches the curated catalog, e.g. "Chicago, Illinois").
    label = region if country == "United States" and region else country
    return Destination(
        id=slug, name=_text(g.get("displayName")), country=label,
        image=image, blurb=_text(g.get("editorialSummary")), best_for=[],
        center=LatLng(lat=g["location"]["latitude"], lng=g["location"]["longitude"]), place_id=g["id"], viewport=viewport,
    )
