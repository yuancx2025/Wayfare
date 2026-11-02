from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.contracts.travel import Destination, LatLng, PlaceDetails, Suggestion
from app.core.exceptions import BadGateway, Conflict, NotFound, Unprocessable, UpstreamError
from app.domain.scheduler import distance_km, is_open_during
from app.features.discovery import repository
from app.features.discovery.enrichment import enrich
from app.features.discovery.schemas import MAX_NEARBY_RESULTS, NEARBY_CATEGORIES, NearbyPlace, NearbyRequest, NearbyResults
from app.integrations.places.catalog_data import catalog_destinations, load_catalog
from app.integrations.services import Services


class DestinationService:
    """Public Discovery interface for destinations: search, resolution, and lookups for planning and adjustments."""

    def __init__(self, session: AsyncSession, services: Services):
        self.session = session
        self.services = services

    async def search(self, q: str) -> list[Destination]:
        found = await repository.search_destinations(self.session, q)
        if found or not q.strip():
            return found
        try:
            cities = await self.services.places.search_destinations(q)
        except UpstreamError:
            return []
        return [await repository.upsert_destination(self.session, await enrich(c, self.services.llm)) for c in cities]

    async def resolve(self, place_id: str) -> Destination:
        existing = await repository.get_destination(self.session, place_id)
        if existing:
            return existing
        try:
            dest = await self.services.places.resolve_destination(place_id)
        except UpstreamError as e:
            raise BadGateway("Couldn't look up that destination") from e
        if dest is None:
            raise NotFound("Destination not found")
        return await repository.upsert_destination(self.session, await enrich(dest, self.services.llm))

    async def get(self, destination_id: str) -> Destination:
        dest = await repository.get_destination(self.session, destination_id)
        if dest is None:
            raise NotFound("Destination not found")
        return dest

    async def resolve_for_draft(self, destination_id: str | None, text: str) -> Destination:
        """Destination for a new trip: a known id or place id first, then the typed name. Raises `UpstreamError`."""
        if destination_id:
            dest = await repository.get_destination(self.session, destination_id)
            if dest:
                return dest
            dest = await self.services.places.resolve_destination(destination_id)
            if dest:
                return await repository.upsert_destination(self.session, dest)
        dest = await repository.find_destination_by_name(self.session, text)
        if dest:
            return dest
        found = await self.services.places.search_destinations(text, limit=1)
        if found:
            return await repository.upsert_destination(self.session, found[0])
        if self.services.places.source == "catalog":
            names = ", ".join(d.name for d in catalog_destinations())
            raise Unprocessable(f"Without a Google Maps key this server can plan {names}.")
        raise Unprocessable(f"We couldn't find \u201c{text}\u201d. Try a city name.")

    async def get_for_trip(self, destination_id: str) -> Destination:
        dest = await repository.get_destination(self.session, destination_id)
        if dest is None and destination_id in load_catalog():
            dest = load_catalog()[destination_id][0]
        if dest is None:
            raise Conflict("This trip's destination is no longer available")
        return dest


class PlaceService:
    def __init__(self, services: Services):
        self.services = services

    async def autocomplete(self, q: str, session_token: str | None) -> list[Suggestion]:
        try:
            return await self.services.places.autocomplete(q, session_token)
        except UpstreamError as e:
            raise BadGateway("Place search is unavailable right now") from e

    async def nearby(self, req: NearbyRequest) -> NearbyResults:
        """Closest places to the user's position. The coordinates are used for this request only."""
        here = LatLng(lat=req.lat, lng=req.lng)
        wanted = NEARBY_CATEGORIES[req.category]
        try:
            found = await self.services.places.around((req.lat, req.lng), wanted, req.radius_m)
        except UpstreamError as e:
            raise BadGateway("Nearby search is unavailable right now") from e
        # Google tags some cafes and markets "tourist_attraction"; keep only what the user picked.
        found = [p for p in found if p.category in wanted]
        ranked = sorted(((p, round(distance_km(here, p) * 1000)) for p in found), key=lambda pair: pair[1])
        places = [NearbyPlace(place=p, distance_m=d) for p, d in ranked if d <= req.radius_m][:MAX_NEARBY_RESULTS]
        return NearbyResults(source=self.services.places.source, places=places)

    async def details(self, place_id: str, on: date | None, start_min: int | None, duration_min: int | None) -> PlaceDetails:
        try:
            details = await self.services.places.details(place_id)
        except UpstreamError as e:
            raise BadGateway("Place details are unavailable right now") from e
        if details is None:
            raise NotFound("Place not found")
        if on and start_min is not None:
            details.open_during_visit = is_open_during(details.hours, on.isoformat(), start_min, duration_min or 0)
        return details

    async def photo_url(self, place_id: str, max_width: int) -> str:
        try:
            url = await self.services.places.photo_url(place_id, max_width)
        except UpstreamError as e:
            raise BadGateway("Photo unavailable") from e
        if not url:
            raise NotFound("No photo")
        return url
