from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFound
from app.features.collections import repository
from app.features.collections.schemas import SavedPlace, SavedPlaceDetails, SavedPlaceReference
from app.features.discovery.service import DestinationService, PlaceService


class CollectionService:
    """Persistence does not fetch provider details, so unavailable references stay removable."""

    def __init__(self, session: AsyncSession, destinations: DestinationService, places: PlaceService):
        self.session = session
        self.destinations = destinations
        self.places = places

    async def list_saved_places(self, user_id: str) -> list[SavedPlace]:
        return [repository.saved_place_from_row(row) for row in await repository.list_saved_places(self.session, user_id)]

    async def save_place(self, user_id: str, reference: SavedPlaceReference) -> SavedPlace:
        row = await repository.save_place(self.session, user_id, reference)
        result = repository.saved_place_from_row(row)
        await self.session.commit()
        return result

    async def remove_saved_place(self, user_id: str, saved_id: str) -> None:
        if not await repository.remove_saved_place(self.session, user_id, saved_id):
            raise NotFound("Saved place not found")
        await self.session.commit()

    async def get_details(self, user_id: str, saved_id: str) -> SavedPlaceDetails:
        row = await repository.get_saved_place(self.session, user_id, saved_id)
        if row is None:
            raise NotFound("Saved place not found")
        reference = SavedPlaceReference(provider=row.provider, kind=row.kind, external_id=row.external_id)
        if row.kind == "destination":
            destination = await self.destinations.saved_destination(row.provider, row.external_id)
            return SavedPlaceDetails(
                reference=reference, name=destination.name, subtitle=destination.country, description=destination.blurb,
                image=destination.image or None, destination_id=destination.id, best_for=destination.best_for,
                google_maps_uri=f"https://www.google.com/maps/search/?api=1&query={destination.center.lat},{destination.center.lng}",
            )
        place, details = await self.places.saved_place(row.provider, row.external_id)
        return SavedPlaceDetails(
            reference=reference, name=place.name, subtitle=place.area, description=place.description, rating=details.rating,
            website_uri=details.website_uri, google_maps_uri=details.google_maps_uri, weekday_descriptions=details.weekday_descriptions,
        )
