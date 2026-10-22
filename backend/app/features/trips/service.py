import asyncio

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.contracts.travel import Day, Trip
from app.core.exceptions import NotFound, UpstreamError
from app.db.session import get_sessionmaker
from app.features.trips import repository
from app.features.trips.schemas import DayRoute, RouteLeg, TripSummary
from app.integrations.routing.protocol import TravelRouter


class TripService:
    """Public Trips interface. Other features read and write trips only through this class."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_summaries(self, user_id: str) -> list[TripSummary]:
        return [repository.summary_from_row(r) for r in await repository.list_trip_rows(self.session, user_id)]

    async def get(self, user_id: str, trip_id: str) -> Trip | None:
        row = await repository.get_trip_row(self.session, user_id, trip_id)
        return repository.trip_from_row(row) if row else None

    async def delete(self, user_id: str, trip_id: str) -> None:
        row = await repository.get_trip_row(self.session, user_id, trip_id)
        if row is None:
            raise NotFound("Trip not found")
        await repository.delete_trip(self.session, row)

    async def find_by_idempotency(self, user_id: str, key: str) -> Trip | None:
        row = await repository.find_trip_by_idempotency(self.session, user_id, key)
        return repository.trip_from_row(row) if row else None

    async def save_generated(self, user_id: str, trip: Trip, idempotency_key: str | None) -> Trip:
        # Generation finishes after the request's session may be closed, so this uses its own session.
        async with get_sessionmaker()() as s:
            try:
                await repository.save_trip(s, user_id, trip, idempotency_key)
                return trip
            except IntegrityError:
                # A concurrent retry with the same key already saved a trip; return that one.
                await s.rollback()
                existing = await repository.find_trip_by_idempotency(s, user_id, idempotency_key or "")
                if existing is None:
                    raise
                return repository.trip_from_row(existing)

    async def apply_day_if_version(self, user_id: str, trip: Trip, day: Day, expected_version: int) -> Trip | None:
        """Replaces one day of `trip` if the stored trip is still at `expected_version`. The caller commits.

        `trip` must be the snapshot read at `expected_version`; the conditional update refuses the write otherwise.
        """
        days = [day.dump() if d.index == day.index else d.dump() for d in trip.days]
        row = await repository.apply_day_if_version(self.session, user_id, trip.id, days, expected_version)
        return repository.trip_from_row(row) if row else None

    async def day_route(self, trip: Trip, day_index: int, router: TravelRouter) -> DayRoute:
        if not 0 <= day_index < len(trip.days):
            raise NotFound("Day not found")
        acts = trip.days[day_index].activities
        pairs = [(acts[i - 1], acts[i]) for i in range(1, len(acts)) if acts[i].leg_in]

        async def one(a, b):
            try:
                return await router.leg_polyline(a, b, b.leg_in.mode)
            except UpstreamError:
                return None

        polylines = await asyncio.gather(*(one(a, b) for a, b in pairs))
        return DayRoute(
            legs=[RouteLeg(from_id=a.id, to_id=b.id, mode=b.leg_in.mode, polyline=p) for (a, b), p in zip(pairs, polylines)],
            source="google" if any(polylines) else "estimate",
        )
