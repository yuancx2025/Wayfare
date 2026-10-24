from collections.abc import Awaitable, Callable

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.contracts.travel import Preferences
from app.core.config import get_settings
from app.features.profiles.models import User
from app.features.profiles.schemas import DEFAULT_PREFS

DEMO_PROFILE = {"name": "Alex Rivera", "home": "Brooklyn, NY", "traveling_since": 2019}

NewUserHook = Callable[[AsyncSession, str], Awaitable[None]]


async def get_or_create_user(session: AsyncSession, user_id: str, on_created: NewUserHook | None = None) -> User:
    """`on_created` runs inside the same transaction, after the user row is flushed and before the commit."""
    user = await session.get(User, user_id)
    if user:
        return user
    profile = DEMO_PROFILE if user_id == get_settings().default_user_id else {"name": "Traveler", "home": "", "traveling_since": None}
    user = User(id=user_id, default_prefs=DEFAULT_PREFS.dump(), **profile)
    session.add(user)
    try:
        await session.flush()
        if on_created:
            await on_created(session, user_id)
        await session.commit()
    except IntegrityError:
        # A new client fires several requests at once; another one created this user first.
        await session.rollback()
        existing = await session.get(User, user_id, populate_existing=True)
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
