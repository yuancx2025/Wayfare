from app.contracts.travel import Trip
from app.core.routing import ApiRouter
from app.features.profiles.dependencies import UserIdDep
from app.features.trips.dependencies import TripDep, TripServiceDep
from app.features.trips.schemas import DayRoute, TripMetadataPatch, TripMetadataResult, TripSummary
from app.integrations.services import ServicesDep

router = ApiRouter(prefix="/trips", tags=["trips"])


@router.get("", response_model=list[TripSummary])
async def list_trips(trips: TripServiceDep, user_id: UserIdDep) -> list[TripSummary]:
    return await trips.list_summaries(user_id)


@router.get("/{trip_id}", response_model=Trip)
async def get_trip(trip: TripDep) -> Trip:
    return trip


@router.patch("/{trip_id}", response_model=TripMetadataResult)
async def update_trip_metadata(
    trip_id: str, patch: TripMetadataPatch, trips: TripServiceDep, user_id: UserIdDep,
) -> TripMetadataResult:
    return await trips.update_metadata(user_id, trip_id, patch)


@router.delete("/{trip_id}", status_code=204)
async def remove_trip(trip: TripDep, trips: TripServiceDep, user_id: UserIdDep) -> None:
    await trips.delete(user_id, trip.id)


@router.get("/{trip_id}/days/{day_index}/route", response_model=DayRoute)
async def day_route(day_index: int, trip: TripDep, trips: TripServiceDep, services: ServicesDep) -> DayRoute:
    return await trips.day_route(trip, day_index, services.router)
