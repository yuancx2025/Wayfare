from sqlalchemy.ext.asyncio import AsyncSession

from app.contracts.travel import Preferences, Trip
from app.features.profiles import repository
from app.features.profiles.models import User
from app.features.profiles.schemas import CategoryCount, Insights, Me, ProfilePatch, Stats
from app.features.trips.service import TripService


def initials(name: str) -> str:
    return "".join(w[0] for w in name.split()[:2]).upper() or "?"


def trip_insights(trips: list[Trip]) -> Insights:
    """Same rules as `tripInsights` in the app: a place counts once however many trips include it."""
    places = {a.place_id: a.category for t in trips for d in t.days for a in d.activities}
    counts: dict[str, int] = {}
    for category in places.values():
        counts[category] = counts.get(category, 0) + 1
    top = sorted(counts.items(), key=lambda item: (-item[1], item[0]))[:3]
    return Insights(
        trips=len(trips),
        days=sum(len(t.days) for t in trips),
        stops=sum(len(d.activities) for t in trips for d in t.days),
        destinations=len({t.destination_id for t in trips}),
        top_categories=[CategoryCount(category=c, places=n) for c, n in top],
    )


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

    async def insights(self, user_id: str) -> Insights:
        return trip_insights(await self.trips.list_trips(user_id))

    async def update_profile(self, user_id: str, patch: ProfilePatch) -> Me:
        fields: dict[str, str] = {}
        if "name" in patch.model_fields_set and patch.name is not None:
            fields["name"] = patch.name
        if "home" in patch.model_fields_set and patch.home is not None:
            fields["home"] = patch.home
        if fields:
            await repository.update_profile(self.session, await self._user(user_id), fields)
        return await self.me(user_id)

    async def preferences(self, user_id: str) -> Preferences:
        return Preferences.model_validate((await self._user(user_id)).default_prefs)

    async def save_preferences(self, user_id: str, prefs: Preferences) -> Preferences:
        await repository.save_default_prefs(self.session, await self._user(user_id), prefs)
        return prefs
