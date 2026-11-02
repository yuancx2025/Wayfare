"""Google clients and normalization, exercised against a mocked HTTP transport (no network)."""

import json

import httpx
import pytest
from sqlalchemy import text

from app.integrations.cache import PlaceCache
from app.db.session import get_sessionmaker
from app.integrations.places import normalize
from app.integrations.places.google_client import GoogleAPIError, GooglePlacesClient
from app.integrations.routing.google_client import GoogleRoutesClient
from app.domain.scheduler import is_open_during
from app.integrations.places.google import GooglePlaceProvider
from app.integrations.routing.google import GoogleTravelRouter
from app.integrations.routing.legs import resolve_legs
from app.contracts.travel import Activity, Day, Destination, LatLng, Preferences

MUSEUM = {
    "id": "ChIJmuseum", "displayName": {"text": "Art Institute"}, "types": ["museum", "tourist_attraction"],
    "location": {"latitude": 41.8796, "longitude": -87.6237}, "priceLevel": "PRICE_LEVEL_MODERATE", "rating": 4.8,
    "editorialSummary": {"text": "Impressionist masterpieces."},
    "addressComponents": [{"longText": "The Loop", "shortText": "Loop", "types": ["neighborhood", "political"]}],
    "regularOpeningHours": {"periods": [{"open": {"day": d, "hour": 11, "minute": 0}, "close": {"day": d, "hour": 17, "minute": 0}} for d in (1, 2, 3, 4, 5, 6)]},
}
CAFE = {
    "id": "ChIJcafe", "displayName": {"text": "Bean Bar"}, "types": ["cafe", "food"], "location": {"latitude": 41.88, "longitude": -87.63},
    "priceLevel": "PRICE_LEVEL_INEXPENSIVE", "shortFormattedAddress": "12 State St, Chicago",
}
PREFS = Preferences(pace="balanced", interests=["museums"], food=["cafes"], transport="transit", budget="moderate")
DEST = Destination(id="chicago", name="Chicago", country="Illinois", image="", blurb="", best_for=[], center=LatLng(lat=41.88, lng=-87.63))


def test_to_place_maps_types_price_area_and_hours():
    p = normalize.to_place(MUSEUM, hint="museums")
    assert p and p.category == "museums" and p.price == 2 and p.area == "Loop" and p.duration_min == 90
    assert p.description == "Impressionist masterpieces."
    assert is_open_during(p.hours, "2030-06-11", 12 * 60, 90) is True  # Tuesday
    assert is_open_during(p.hours, "2030-06-09", 12 * 60, 90) is False  # Sunday: closed
    cafe = normalize.to_place(CAFE, hint="food", food_hint="cafes")
    assert cafe and cafe.category == "food" and cafe.food == ["cafes"] and cafe.duration_min == 25 and cafe.price == 1
    assert cafe.area == "12 State St" and cafe.hours is None


def test_food_types_override_interest_hint_and_closed_places_are_dropped():
    assert normalize.to_place({**CAFE, "types": ["seafood_restaurant"]}, hint="culture").category == "food"
    assert normalize.to_place({**MUSEUM, "businessStatus": "CLOSED_PERMANENTLY"}) is None


def test_always_open_hours():
    hours = normalize.hours_for({"regularOpeningHours": {"periods": [{"open": {"day": 0, "hour": 0, "minute": 0}}]}})
    assert hours and len(hours) == 7 and all(w.close_min == 1440 for w in hours)


class Recorder:
    def __init__(self, routes: dict):
        self.routes, self.calls = routes, []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.calls.append(request)
        for (method, suffix), payload in self.routes.items():
            if request.method == method and request.url.path.endswith(suffix):
                status, body = payload if isinstance(payload, tuple) else (200, payload)
                return httpx.Response(status, json=body)
        return httpx.Response(404, json={"error": {"message": "not mocked"}})


@pytest.fixture
async def cache(fresh_database):
    yield PlaceCache(get_sessionmaker(), 60)


async def test_candidates_send_field_masks_and_are_cached(cache):
    rec = Recorder({("POST", "places:searchText"): {"places": [MUSEUM, CAFE]}})
    provider = GooglePlaceProvider(GooglePlacesClient("k", httpx.AsyncClient(transport=httpx.MockTransport(rec))), cache)
    places = await provider.candidates(DEST, PREFS)
    assert {p.id for p in places} == {"ChIJmuseum", "ChIJcafe"}
    assert len(rec.calls) == 2  # one interest query + one food query
    first = rec.calls[0]
    assert first.headers["X-Goog-Api-Key"] == "k"
    assert first.headers["X-Goog-FieldMask"].startswith("places.id,places.displayName")
    body = json.loads(first.content)
    assert body["textQuery"] == "museums in Chicago, Illinois" and "circle" in body["locationBias"]
    await provider.candidates(DEST, PREFS)
    assert len(rec.calls) == 2, "second call should be served from the place cache"


async def test_autocomplete_and_errors(cache):
    rec = Recorder({
        ("POST", "places:autocomplete"): {"suggestions": [{"placePrediction": {
            "placeId": "ChIJlis", "text": {"text": "Lisbon, Portugal"},
            "structuredFormat": {"mainText": {"text": "Lisbon"}, "secondaryText": {"text": "Portugal"}},
        }}]},
        ("GET", "places/ChIJbad"): (403, {"error": {"message": "API key not valid"}}),
    })
    provider = GooglePlaceProvider(GooglePlacesClient("k", httpx.AsyncClient(transport=httpx.MockTransport(rec))), cache)
    [s] = await provider.autocomplete("lis", "tok")
    assert (s.place_id, s.name, s.secondary, s.source) == ("ChIJlis", "Lisbon", "Portugal", "google")
    assert json.loads(rec.calls[0].content) == {"input": "lis", "sessionToken": "tok", "includedPrimaryTypes": ["(cities)"]}
    with pytest.raises(GoogleAPIError) as err:
        await provider.details("ChIJbad")
    assert err.value.status == 403


def _act(i: int, lat: float, lng: float) -> Activity:
    return Activity(id=f"a{i}", place_id=f"p{i}", name=f"Stop {i}", category="culture", area="X", lat=lat, lng=lng,
                    start_min=0, duration_min=60, description="", why="")


async def test_route_matrix_diagonal_feeds_leg_table(cache):
    matrix = [
        {"originIndex": 0, "destinationIndex": 0, "duration": "754s", "distanceMeters": 3120, "condition": "ROUTE_EXISTS"},
        {"originIndex": 0, "destinationIndex": 1, "duration": "99s", "distanceMeters": 1, "condition": "ROUTE_EXISTS"},
        {"originIndex": 1, "destinationIndex": 1, "condition": "ROUTE_NOT_FOUND"},
    ]
    rec = Recorder({("POST", "computeRouteMatrix"): matrix})
    router = GoogleTravelRouter(GoogleRoutesClient("k", httpx.AsyncClient(transport=httpx.MockTransport(rec))), cache)
    day = Day(index=0, date="2030-06-11", theme="", areas="", start_min=540, buffer_min=15,
              activities=[_act(0, 41.88, -87.63), _act(1, 41.90, -87.63), _act(2, 41.92, -87.63)])
    table = await resolve_legs([day], "transit", router)
    assert table.known == {("p0", "p1", "transit"): (13, 3.1)}
    body = json.loads(rec.calls[0].content)
    assert body["travelMode"] == "TRANSIT" and len(body["origins"]) == 2
    leg = table.leg(day.activities[0], day.activities[1], "transit", None)
    assert (leg.minutes, leg.km, leg.source) == (13, 3.1, "google")
    assert table.leg(day.activities[1], day.activities[2], "transit", None).source == "estimate"


async def test_around_ranks_by_distance_and_keeps_planner_ranking(cache):
    rec = Recorder({("POST", "places:searchNearby"): {"places": [CAFE, MUSEUM]}})
    provider = GooglePlaceProvider(GooglePlacesClient("k", httpx.AsyncClient(transport=httpx.MockTransport(rec))), cache)
    places = await provider.around((41.88, -87.63), ["food"], 1500)
    assert {p.id: p.category for p in places} == {"ChIJcafe": "food", "ChIJmuseum": "museums"}
    body = json.loads(rec.calls[0].content)
    assert body["rankPreference"] == "DISTANCE" and body["includedTypes"] == sorted(normalize.NEARBY_TYPES["food"])
    assert body["locationRestriction"]["circle"]["radius"] == 1500
    await provider.around((41.88, -87.63), ["food"], 1500)
    assert len(rec.calls) == 2, "the user's position never goes into the shared cache"
    async with get_sessionmaker()() as session:
        keys = (await session.execute(text("SELECT key FROM place_cache"))).scalars().all()
    assert not [k for k in keys if k.startswith("around")]
    await provider.nearby(DEST, (41.88, -87.63), ["museums"], 1500)
    assert json.loads(rec.calls[-1].content)["rankPreference"] == "POPULARITY", "planner searches keep popularity ranking"
