from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.contracts.travel import Preferences
from app.core.auth import VerifiedIdentity
from app.core.ids import new_id
from app.features.profiles.models import User
from app.features.profiles.schemas import DEFAULT_PREFS


async def _by_clerk_id(session: AsyncSession, clerk_user_id: str) -> User | None:
    return (await session.execute(select(User).where(User.clerk_user_id == clerk_user_id))).scalar_one_or_none()


async def get_or_create_by_clerk(session: AsyncSession, identity: VerifiedIdentity) -> User:
    """New accounts start with no trips."""
    user = await _by_clerk_id(session, identity.clerk_user_id)
    if user:
        return user
    user = User(
        id=new_id("u"), clerk_user_id=identity.clerk_user_id, name=(identity.name or "").strip()[:120] or "Traveler",
        email=identity.email, home="", traveling_since=None, default_prefs=DEFAULT_PREFS.dump(),
    )
    session.add(user)
    try:
        await session.commit()
    except IntegrityError:
        # A new client fires several requests at once; another one created this user first.
        await session.rollback()
        existing = await _by_clerk_id(session, identity.clerk_user_id)
        if existing is None:
            raise
        return existing
    return user


async def get_user(session: AsyncSession, user_id: str) -> User | None:
    return await session.get(User, user_id)


async def save_default_prefs(session: AsyncSession, user: User, prefs: Preferences) -> None:
    user.default_prefs = prefs.dump()
    await session.commit()


async def update_profile(session: AsyncSession, user: User, fields: dict[str, str]) -> None:
    if "name" in fields:
        user.name = fields["name"]
    if "home" in fields:
        user.home = fields["home"]
    await session.commit()
