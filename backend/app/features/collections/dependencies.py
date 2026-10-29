from typing import Annotated

from fastapi import Depends

from app.db.session import SessionDep
from app.features.collections.service import CollectionService


def get_collection_service(session: SessionDep) -> CollectionService:
    return CollectionService(session)


CollectionServiceDep = Annotated[CollectionService, Depends(get_collection_service)]
