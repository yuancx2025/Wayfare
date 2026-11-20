"""A local stand-in for Places API (New) and the Routes API, built from the bundled catalog. No network, no cost.

Responses have the shapes `GooglePlacesClient` and `GoogleRoutesClient` parse, trimmed to the request's field mask the
way Google trims them. The content is synthetic. Searches return catalog places matching the query's city and
category. Routes use straight-line distance with a detour factor and a fixed speed per travel mode.
"""

import asyncio
import json
import math
from urllib.parse import parse_qs

import httpx

from app.contracts.travel import Destination, Place
from app.integrations.places import normalize
from app.integrations.places.catalog_data import load_catalog

CITY_PREFIX = "city-"
CATEGORY_TYPES = {
    "museums": ["museum"], "nature": ["park"], "culture": ["historical_landmark"], "architecture": ["observation_deck"],
    "shopping": ["market"], "nightlife": ["night_club"],
}
FOOD_TYPE = {
    "local-classics": "restaurant", "street-food": "fast_food_restaurant", "seafood": "seafood_restaurant",
    "vegetarian": "vegetarian_restaurant", "cafes": "cafe", "fine-dining": "fine_dining_restaurant",
}
PRICE_LEVEL = {1: "PRICE_LEVEL_INEXPENSIVE", 2: "PRICE_LEVEL_MODERATE", 3: "PRICE_LEVEL_EXPENSIVE"}
SPEED_KMH = {"WALK": 4.8, "TRANSIT": 20.0, "DRIVE": 25.0}
TRANSIT_WAIT_S = 360
DETOUR = 1.3


def distance_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lng2 - lng1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(a))


def encode_polyline(points: list[tuple[float, float]]) -> str:
    """Google's encoded polyline format, so the app can draw what it gets."""
    out, prev = [], (0, 0)
    for lat, lng in points:
        cur = (round(lat * 1e5), round(lng * 1e5))
        for delta in (cur[0] - prev[0], cur[1] - prev[1]):
            value = ~(delta << 1) if delta < 0 else delta << 1
            while value >= 0x20:
                out.append(chr((0x20 | (value & 0x1F)) + 63))
                value >>= 5
            out.append(chr(value + 63))
        prev = cur
    return "".join(out)


def google_types(place: Place) -> list[str]:
    if place.category == "food":
        return sorted({FOOD_TYPE[f] for f in place.food or ["local-classics"]} | {"restaurant", "food"})
    return CATEGORY_TYPES[place.category] + ["tourist_attraction"]


def google_place(place: Place) -> dict:
    g = {
        "id": place.id, "displayName": {"text": place.name}, "types": google_types(place), "primaryType": google_types(place)[0],
        "location": {"latitude": place.lat, "longitude": place.lng}, "businessStatus": "OPERATIONAL",
        "shortFormattedAddress": f"{place.area}", "addressComponents": [{"longText": place.area, "shortText": place.area, "types": ["neighborhood"]}],
        "editorialSummary": {"text": place.description}, "photos": [{"name": f"places/{place.id}/photos/p1"}],
        "websiteUri": f"https://example.invalid/{place.id}", "googleMapsUri": f"https://maps.example.invalid/{place.id}",
        "utcOffsetMinutes": 0,
    }
    if place.rating is not None:
        g["rating"], g["userRatingCount"] = place.rating, 500
    if place.price in PRICE_LEVEL:
        g["priceLevel"] = PRICE_LEVEL[place.price]
    return g


def google_city(dest: Destination) -> dict:
    lat, lng = dest.center.lat, dest.center.lng
    return {
        "id": CITY_PREFIX + dest.id, "displayName": {"text": dest.name}, "types": ["locality", "political"],
        "location": {"latitude": lat, "longitude": lng},
        "viewport": {"low": {"latitude": lat - 0.12, "longitude": lng - 0.16}, "high": {"latitude": lat + 0.12, "longitude": lng + 0.16}},
        "addressComponents": [{"longText": dest.country, "shortText": dest.country, "types": ["country", "political"]}],
        "formattedAddress": f"{dest.name}, {dest.country}", "editorialSummary": {"text": dest.blurb},
        "photos": [{"name": f"places/{CITY_PREFIX}{dest.id}/photos/p1"}],
    }


def masked(g: dict, mask: str, prefix: str = "") -> dict:
    """Keep only the top-level fields the request asked for, as Google does."""
    if not mask or mask == "*":
        return g
    fields = {f.removeprefix(prefix).split(".")[0] for f in mask.split(",")}
    return {k: v for k, v in g.items() if k in fields}


def not_found() -> httpx.Response:
    return httpx.Response(404, json={"error": {"code": 404, "message": "Not found", "status": "NOT_FOUND"}})


class FakeGoogle:
    """`httpx.MockTransport` handler. `latency_s` is added to every response to model Google's round trip."""

    def __init__(self, latency_s: float = 0.0):
        self.latency_s = latency_s
        self.cities = {CITY_PREFIX + d.id: (d, places) for d, places in load_catalog().values()}
        self.places = {p.id: p for _, places in self.cities.values() for p in places}

    async def __call__(self, request: httpx.Request) -> httpx.Response:
        if self.latency_s:
            await asyncio.sleep(self.latency_s)
        path, mask = request.url.path, request.headers.get("X-Goog-FieldMask", "")
        body = json.loads(request.content) if request.content else {}
        if path.endswith("/directions/v2:computeRoutes"):
            return self._route(body)
        if path == "/v1/places:autocomplete":
            return self._autocomplete(body)
        if path == "/v1/places:searchText":
            return httpx.Response(200, json={"places": [masked(g, mask, "places.") for g in self._text_search(body)]})
        if path == "/v1/places:searchNearby":
            return httpx.Response(200, json={"places": [masked(g, mask, "places.") for g in self._nearby(body)]})
        if path.endswith("/media"):
            width = parse_qs(request.url.query.decode()).get("maxWidthPx", ["1000"])[0]
            place_id = path.split("/")[3]
            return httpx.Response(200, json={"name": path[4:], "photoUri": f"https://photos.example.invalid/{place_id}?w={width}"})
        if path.startswith("/v1/places/"):
            place_id = path.removeprefix("/v1/places/")
            if place_id in self.cities:
                return httpx.Response(200, json=masked(google_city(self.cities[place_id][0]), mask))
            if place_id in self.places:
                return httpx.Response(200, json=masked(google_place(self.places[place_id]), mask))
            return not_found()
        return not_found()

    def _autocomplete(self, body: dict) -> httpx.Response:
        text = body.get("input", "").strip().lower()
        suggestions = [
            {"placePrediction": {
                "placeId": city_id, "text": {"text": f"{d.name}, {d.country}"},
                "structuredFormat": {"mainText": {"text": d.name}, "secondaryText": {"text": d.country}},
            }}
            for city_id, (d, _) in self.cities.items() if text and d.name.lower().startswith(text)
        ]
        return httpx.Response(200, json={"suggestions": suggestions})

    def _text_search(self, body: dict) -> list[dict]:
        query = body["textQuery"]
        if body.get("includedType") == "locality":
            q = query.strip().lower()
            return [google_city(d) for d, _ in self.cities.values() if d.name.lower().startswith(q)][: body.get("pageSize", 20)]
        head, _, city = query.partition(" in ")
        places = next((ps for d, ps in self.cities.values() if city.startswith(d.name)), [])
        food = [p for p in places if p.category == "food"]
        found: list[Place] = []
        for key, template in normalize.INTEREST_QUERIES.items():
            if template.split(" in ")[0] == head:
                found = [p for p in places if p.category == key]
        for key, template in normalize.FOOD_QUERIES.items():
            if template.split(" in ")[0] == head:
                found = [p for p in food if key in (p.food or [])] or food
        if head == "popular restaurants":
            found = food
        found.sort(key=lambda p: (-(p.rating or 0), p.id))
        return [google_place(p) for p in found[: body.get("pageSize", 20)]]

    def _nearby(self, body: dict) -> list[dict]:
        wanted = set(body["includedTypes"])
        circle = body["locationRestriction"]["circle"]
        lat, lng, radius_m = circle["center"]["latitude"], circle["center"]["longitude"], circle["radius"]
        scored = [
            (p, distance_km(lat, lng, p.lat, p.lng) * 1000) for p in self.places.values() if wanted & set(google_types(p))
        ]
        scored = [(p, d) for p, d in scored if d <= radius_m]
        if body.get("rankPreference") == "DISTANCE":
            scored.sort(key=lambda pair: (pair[1], pair[0].id))
        else:
            scored.sort(key=lambda pair: (-(pair[0].rating or 0), pair[0].id))
        return [google_place(p) for p, _ in scored[: body.get("maxResultCount", 20)]]

    def _route(self, body: dict) -> httpx.Response:
        a, b = body["origin"]["location"]["latLng"], body["destination"]["location"]["latLng"]
        mode = body.get("travelMode", "DRIVE")
        km = distance_km(a["latitude"], a["longitude"], b["latitude"], b["longitude"]) * DETOUR
        seconds = max(60, round(km / SPEED_KMH[mode] * 3600 + (TRANSIT_WAIT_S if mode == "TRANSIT" else 0)))
        polyline = encode_polyline([(a["latitude"], a["longitude"]), (b["latitude"], b["longitude"])])
        return httpx.Response(200, json={"routes": [
            {"duration": f"{seconds}s", "distanceMeters": round(km * 1000), "polyline": {"encodedPolyline": polyline}},
        ]})
