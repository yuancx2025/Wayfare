from typing import Annotated

from fastapi import Depends, HTTPException

from app.contracts.travel import Trip
from app.db.session import SessionDep
from app.features.profiles.dependencies import UserIdDep
from app.features.trips.service import TripService


def get_trip_service(session: SessionDep) -> TripService:
    return TripService(session)


TripServiceDep = Annotated[TripService, Depends(get_trip_service)]


async def trip_or_404(trip_id: str, trips: TripServiceDep, user_id: UserIdDep) -> Trip:
    trip = await trips.get(user_id, trip_id)
    if trip is None:
        raise HTTPException(404, "Trip not found")
    return trip


TripDep = Annotated[Trip, Depends(trip_or_404)]
