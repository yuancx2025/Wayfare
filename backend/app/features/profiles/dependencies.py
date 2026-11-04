from typing import Annotated

from fastapi import Depends

from app.core.auth import VerifiedIdentityDep
from app.db.session import SessionDep
from app.features.profiles.repository import get_or_create_by_clerk
from app.features.profiles.service import ProfileService
from app.features.trips.service import TripService


async def current_user_id(identity: VerifiedIdentityDep, session: SessionDep) -> str:
    """Internal id of the signed-in Clerk user. Their row is created on the first request."""
    return (await get_or_create_by_clerk(session, identity)).id


UserIdDep = Annotated[str, Depends(current_user_id)]


def get_profile_service(session: SessionDep) -> ProfileService:
    return ProfileService(session, TripService(session))


ProfileServiceDep = Annotated[ProfileService, Depends(get_profile_service)]
