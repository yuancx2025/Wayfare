from datetime import date
from typing import Annotated

from fastapi import Query
from fastapi.responses import RedirectResponse

from app.contracts.travel import PlaceDetails, Suggestion
from app.core.routing import ApiRouter
from app.features.discovery.dependencies import PlaceServiceDep
from app.features.discovery.schemas import NearbyRequest, NearbyResults
from app.features.profiles.dependencies import UserIdDep

router = ApiRouter(prefix="/places", tags=["places"])


@router.get("/autocomplete", response_model=list[Suggestion])
async def autocomplete(places: PlaceServiceDep, _: UserIdDep, q: str = "", session: str | None = None) -> list[Suggestion]:
    return await places.autocomplete(q, session)


@router.post("/nearby/search", response_model=NearbyResults)
async def nearby_search(body: NearbyRequest, places: PlaceServiceDep, _: UserIdDep) -> NearbyResults:
    """Places closest to the caller's position. Coordinates are not stored or logged."""
    return await places.nearby(body)


@router.get("/{place_id}", response_model=PlaceDetails)
async def place_details(
    place_id: str, places: PlaceServiceDep, _: UserIdDep,
    on: Annotated[date | None, Query(alias="date")] = None,
    start_min: Annotated[int | None, Query(alias="startMin", ge=0, le=2880)] = None,
    duration_min: Annotated[int | None, Query(alias="durationMin", ge=0, le=1440)] = None,
) -> PlaceDetails:
    return await places.details(place_id, on, start_min, duration_min)


@router.get("/{place_id}/photo", response_class=RedirectResponse, status_code=302)
async def place_photo(place_id: str, places: PlaceServiceDep, max_width: Annotated[int, Query(alias="maxWidth", ge=64, le=4800)] = 1000):
    """Redirects to a short-lived image URL so the server key never reaches the browser. No auth: used in <img>."""
    url = await places.photo_url(place_id, max_width)
    return RedirectResponse(url, status_code=302, headers={"Cache-Control": "private, max-age=300"})
