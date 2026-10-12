from typing import Annotated

from fastapi import Depends

from app.db.session import SessionDep
from app.features.discovery.service import DestinationService, PlaceService
from app.integrations.services import ServicesDep


def get_destination_service(session: SessionDep, services: ServicesDep) -> DestinationService:
    return DestinationService(session, services)


def get_place_service(services: ServicesDep) -> PlaceService:
    return PlaceService(services)


DestinationServiceDep = Annotated[DestinationService, Depends(get_destination_service)]
PlaceServiceDep = Annotated[PlaceService, Depends(get_place_service)]
