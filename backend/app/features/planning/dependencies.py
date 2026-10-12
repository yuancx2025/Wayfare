from typing import Annotated

from fastapi import Depends

from app.features.discovery.dependencies import DestinationServiceDep
from app.features.planning.service import PlanningService
from app.features.trips.dependencies import TripServiceDep
from app.integrations.services import ServicesDep


def get_planning_service(trips: TripServiceDep, destinations: DestinationServiceDep, services: ServicesDep) -> PlanningService:
    return PlanningService(trips, destinations, services)


PlanningServiceDep = Annotated[PlanningService, Depends(get_planning_service)]
