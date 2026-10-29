from typing import Annotated

from fastapi import Depends

from app.db.session import SessionDep
from app.features.collections.service import CollectionService
from app.features.discovery.dependencies import DestinationServiceDep, PlaceServiceDep


def get_collection_service(session: SessionDep, destinations: DestinationServiceDep, places: PlaceServiceDep) -> CollectionService:
    return CollectionService(session, destinations, places)


CollectionServiceDep = Annotated[CollectionService, Depends(get_collection_service)]
