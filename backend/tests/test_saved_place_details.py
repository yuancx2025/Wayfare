from app.contracts.travel import PlaceDetails
from app.core.exceptions import UpstreamError
from app.integrations.places.catalog import CatalogPlaceProvider
from app.integrations.places.catalog_data import catalog_destinations, catalog_place

PATH = "/me/saved-places"


class FakeGoogle(CatalogPlaceProvider):
    source = "google"

    def __init__(self):
        self.lookups = []
        self.resolutions = []

    async def get_place(self, place_id):
        self.lookups.append(place_id)
        return catalog_place("ny-met").model_copy(update={"id": place_id})

    async def details(self, place_id):
        return PlaceDetails(place_id=place_id, source="google", name="The Met", rating=4.8, website_uri="https://www.metmuseum.org/", weekday_descriptions=["Monday: 10 AM–5 PM"])

    async def resolve_destination(self, place_id):
        self.resolutions.append(place_id)
        return catalog_destinations()[0].model_copy(update={"id": "cached-city-id", "place_id": place_id})


async def save(client, provider="catalog", kind="place", external_id="ny-met"):
    response = await client.post(PATH, json={"provider": provider, "kind": kind, "externalId": external_id})
    assert response.status_code == 200
    return response.json()


async def test_catalog_details_ignore_the_active_google_provider(make_client):
    google = FakeGoogle()
    client = await make_client(places=google)
    place = await save(client)
    destination = await save(client, kind="destination", external_id="nyc")
    point = (await client.get(f"{PATH}/{place['id']}/details")).json()
    city = (await client.get(f"{PATH}/{destination['id']}/details")).json()
    assert point["reference"] == {"provider": "catalog", "kind": "place", "externalId": "ny-met"}
    assert point["name"] == "The Met" and point["subtitle"] == "Upper East Side"
    assert "startMin" not in point and "activityId" not in point
    assert city["name"] == "New York City" and city["destinationId"] == "nyc"
    assert google.lookups == [] and google.resolutions == []
    assert all(set(item) == {"id", "createdAt", "provider", "kind", "externalId"} for item in (await client.get(PATH)).json())


async def test_catalog_references_are_exact_ids_rather_than_planner_name_aliases(make_client):
    client = await make_client()
    saved = await save(client, kind="destination", external_id="New")
    assert (await client.get(f"{PATH}/{saved['id']}/details")).status_code == 404
    assert (await client.get(PATH)).json() == [saved]


async def test_google_details_reuse_discovery_and_keep_external_and_cached_ids_separate(make_client):
    google = FakeGoogle()
    client = await make_client(places=google)
    place = await save(client, "google", "place", "google-point-id")
    destination = await save(client, "google", "destination", "google-city-id")
    details = await client.get(f"{PATH}/{place['id']}/details")
    assert details.status_code == 200
    assert details.json()["rating"] == 4.8 and details.json()["weekdayDescriptions"] == ["Monday: 10 AM–5 PM"]
    for _ in range(2):
        city = (await client.get(f"{PATH}/{destination['id']}/details")).json()
        assert city["reference"]["externalId"] == "google-city-id"
        assert city["destinationId"] == "cached-city-id"
    assert google.lookups == ["google-point-id"]
    assert google.resolutions == ["google-city-id"]


async def test_detail_lookup_checks_ownership_before_calling_a_provider(make_client):
    google = FakeGoogle()
    client = await make_client(places=google)
    saved = await save(client, "google", "place", "google-point-id")
    assert (await client.get(f"{PATH}/{saved['id']}/details", headers={"X-User-Id": "other-user"})).status_code == 404
    assert (await client.get(f"{PATH}/missing/details")).status_code == 404
    assert google.lookups == []


async def test_unavailable_google_provider_does_not_remove_the_reference(make_client):
    client = await make_client()
    saved = await save(client, "google", "place", "unavailable-id")
    assert (await client.get(f"{PATH}/{saved['id']}/details")).status_code == 502
    assert (await client.get(PATH)).json() == [saved]
    assert (await client.delete(f"{PATH}/{saved['id']}")).status_code == 204


async def test_missing_and_failed_provider_details_are_recoverable(make_client):
    class Missing(FakeGoogle):
        async def get_place(self, place_id):
            return None

    missing = await make_client(places=Missing())
    saved = await save(missing, "google", "place", "gone-id")
    assert (await missing.get(f"{PATH}/{saved['id']}/details")).status_code == 404

    class Broken(FakeGoogle):
        async def get_place(self, place_id):
            raise UpstreamError("Provider unavailable")

    broken = await make_client(places=Broken())
    assert (await broken.get(f"{PATH}/{saved['id']}/details")).status_code == 502
    assert (await broken.get(PATH)).json() == [saved]
    assert (await broken.delete(f"{PATH}/{saved['id']}")).status_code == 204


async def test_a_provider_cannot_return_details_for_a_different_reference(make_client):
    class WrongReference(FakeGoogle):
        async def details(self, place_id):
            return PlaceDetails(place_id="different", source="google", name="A different place")

    client = await make_client(places=WrongReference())
    saved = await save(client, "google", "place", "expected-id")
    assert (await client.get(f"{PATH}/{saved['id']}/details")).status_code == 502
    assert (await client.get(PATH)).json() == [saved]
