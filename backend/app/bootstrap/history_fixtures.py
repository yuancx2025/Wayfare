"""Trips with past, ongoing, and today-boundary dates for the history screens.

Generation rejects a start date in the past, so this writes through the trips repository.
Pass the Clerk user id (Dashboard > Users) of the account that should own them:

    uv run python -m app.bootstrap.history_fixtures user_2abc...
"""

import asyncio
import sys
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.bootstrap.seed import DEMO_TRIP_PREFS
from app.contracts.travel import Trip
from app.core.auth import VerifiedIdentity
from app.domain.scheduler import add_days, build_trip_heuristic
from app.features.profiles.repository import get_or_create_by_clerk
from app.features.trips.repository import list_trip_rows, stage_trip
from app.integrations.places.catalog_data import load_catalog

SPECS = (
    ("trip-history-past", "chicago", -12, -8),
    ("trip-history-ends-today", "seattle", -2, 0),
    ("trip-history-starts-today", "nyc", 0, 2),
    ("trip-history-ongoing", "san-francisco", -1, 3),
    ("trip-history-tomorrow", "new-orleans", 1, 3),
)


def history_trips(today: str | None = None) -> list[Trip]:
    day = today or date.today().isoformat()
    catalog = load_catalog()
    trips: list[Trip] = []
    for trip_id, destination_id, start_offset, end_offset in SPECS:
        destination, places = catalog[destination_id]
        trips.append(build_trip_heuristic(
            trip_id, destination, places, add_days(day, start_offset), add_days(day, end_offset), 2, DEMO_TRIP_PREFS,
        ))
    return trips


async def stage_history_fixtures(session: AsyncSession, clerk_user_id: str) -> list[Trip]:
    """Replaces fixture rows for this user so the today boundaries stay current."""
    user = await get_or_create_by_clerk(session, VerifiedIdentity(clerk_user_id=clerk_user_id, email=None, name=None))
    user_id = user.id
    trips = history_trips()
    existing = {row.id: row for row in await list_trip_rows(session, user_id)}
    for trip in trips:
        row = existing.get(trip.id)
        if row is not None:
            await session.delete(row)
    await session.flush()
    for trip in trips:
        stage_trip(session, user_id, trip)
    await session.commit()
    return trips


async def _main() -> None:
    from app.db.session import dispose_engine, get_sessionmaker

    if len(sys.argv) != 2 or not sys.argv[1].startswith("user_"):
        raise SystemExit("Usage: python -m app.bootstrap.history_fixtures <clerk user id, e.g. user_2abc...>")
    clerk_user_id = sys.argv[1]
    async with get_sessionmaker()() as session:
        trips = await stage_history_fixtures(session, clerk_user_id)
    await dispose_engine()
    print(f"Staged {len(trips)} history fixtures for {clerk_user_id}")


if __name__ == "__main__":
    asyncio.run(_main())
