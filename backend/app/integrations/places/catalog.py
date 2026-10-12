"""Offline place provider over the bundled catalog, so the app runs end-to-end without credentials."""

from typing import Literal

from app.contracts.travel import Category, Destination, Place, PlaceDetails, Preferences, Suggestion
from app.integrations.places.catalog_data import catalog_place, catalog_places, find_catalog_destination, load_catalog


class CatalogPlaceProvider:
    source: Literal["catalog"] = "catalog"

    async def autocomplete(self, q: str, session_token: str | None = None) -> list[Suggestion]:
        query = q.strip().lower()
        out = []
        for dest, _ in load_catalog().values():
            if not query or query in dest.name.lower() or query in dest.country.lower():
                out.append(Suggestion(place_id=dest.id, name=dest.name, secondary=dest.country, source="catalog"))
        return out

    async def resolve_destination(self, place_id: str) -> Destination | None:
        entry = load_catalog().get(place_id)
        return entry[0] if entry else find_catalog_destination(place_id)

    async def search_destinations(self, q: str, limit: int = 5) -> list[Destination]:
        return []

    async def candidates(self, dest: Destination, prefs: Preferences) -> list[Place]:
        return list(catalog_places(dest.id))

    async def nearby(self, dest: Destination, center: tuple[float, float], categories: list[Category] | None, radius_m: float) -> list[Place]:
        # The catalog is city-sized, so the radius is ignored (matches the original client-side ranking).
        return [p for p in catalog_places(dest.id) if (p.category in categories if categories else p.category != "food")]

    async def get_place(self, place_id: str) -> Place | None:
        return catalog_place(place_id)

    async def details(self, place_id: str) -> PlaceDetails | None:
        p = catalog_place(place_id)
        if not p:
            return None
        return PlaceDetails(
            place_id=p.id, name=p.name, rating=p.rating, hours=p.hours, source="catalog",
            google_maps_uri=f"https://www.google.com/maps/search/?api=1&query={p.lat},{p.lng}",
        )

    async def photo_url(self, place_id: str, max_width: int) -> str | None:
        entry = load_catalog().get(place_id)
        return entry[0].image if entry else None
