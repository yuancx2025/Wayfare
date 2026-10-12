from sqlalchemy.ext.asyncio import AsyncSession

from app.contracts.travel import Preferences
from app.features.profiles import repository
from app.features.profiles.models import User
from app.features.profiles.schemas import Me, Stats
from app.features.trips.service import TripService


def initials(name: str) -> str:
    return "".join(w[0] for w in name.split()[:2]).upper() or "?"


class ProfileService:
    def __init__(self, session: AsyncSession, trips: TripService):
        self.session = session
        self.trips = trips

    async def _user(self, user_id: str) -> User:
        user = await repository.get_user(self.session, user_id)
        assert user is not None
        return user

    async def me(self, user_id: str) -> Me:
        user = await self._user(user_id)
        summaries = await self.trips.list_summaries(user_id)
        stats = Stats(trips=len(summaries), days_planned=sum(s.day_count for s in summaries), countries=len({s.country for s in summaries}))
        return Me(id=user.id, name=user.name, home=user.home, traveling_since=user.traveling_since, initials=initials(user.name), stats=stats)

    async def preferences(self, user_id: str) -> Preferences:
        return Preferences.model_validate((await self._user(user_id)).default_prefs)

    async def save_preferences(self, user_id: str, prefs: Preferences) -> Preferences:
        await repository.save_default_prefs(self.session, await self._user(user_id), prefs)
        return prefs
