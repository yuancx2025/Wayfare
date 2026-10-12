from typing import Annotated

from fastapi import Depends

from app.db.session import SessionDep
from app.features.adjustments.service import AdjustmentService
from app.features.discovery.dependencies import DestinationServiceDep
from app.features.trips.dependencies import TripServiceDep
from app.integrations.services import ServicesDep


def get_adjustment_service(
    session: SessionDep, trips: TripServiceDep, destinations: DestinationServiceDep, services: ServicesDep,
) -> AdjustmentService:
    return AdjustmentService(session, trips, destinations, services)


AdjustmentServiceDep = Annotated[AdjustmentService, Depends(get_adjustment_service)]
