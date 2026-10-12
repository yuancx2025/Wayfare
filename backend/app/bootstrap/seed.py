"""Catalog destinations and a sample trip for each new user.

Run `uv run python -m app.bootstrap.seed` to refresh curated destinations on an already initialized database.
`uv run python -m app.bootstrap.db init --seed` creates tables and seeds them together.
"""

import asyncio
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.contracts.travel import Preferences, Trip
from app.core.config import get_settings
from app.core.ids import new_id
from app.domain.scheduler import add_days, build_trip_heuristic
from app.features.discovery.repository import seed_catalog_destinations
from app.features.trips.repository import stage_trip
from app.integrations.places.catalog_data import catalog_destinations, load_catalog

DEMO_TRIP_PREFS = Preferences(
    pace="balanced", interests=["food", "culture", "museums", "nature"], food=["street-food", "local-classics"],
    transport="transit", budget="moderate",
)


async def seed_catalog(session: AsyncSession) -> None:
    await seed_catalog_destinations(session, catalog_destinations())


def demo_trip() -> Trip:
    dest, places = load_catalog()["nyc"]
    start = add_days(date.today().isoformat(), 24)
    return build_trip_heuristic(new_id("trip-nyc"), dest, places, start, add_days(start, 4), 2, DEMO_TRIP_PREFS)


async def seed_new_user(session: AsyncSession, user_id: str) -> None:
    """Hook for `get_or_create_user`: runs in the user-creation transaction, before its commit."""
    if get_settings().seed_demo_trip:
        stage_trip(session, user_id, demo_trip())


async def _main() -> None:
    from app.db.session import dispose_engine, get_sessionmaker

    async with get_sessionmaker()() as session:
        await seed_catalog(session)
    await dispose_engine()


if __name__ == "__main__":
    asyncio.run(_main())
