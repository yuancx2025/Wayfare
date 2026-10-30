from datetime import timedelta

import pytest
from pydantic import ValidationError
from sqlalchemy import inspect, select
from sqlalchemy.exc import ProgrammingError

from app.bootstrap.db import initialize
from app.core.config import Settings
from app.db.base import utcnow
from app.db.session import dispose_engine, get_engine, get_sessionmaker, normalize_url
from app.features.adjustments.models import ProposalRow
from app.features.discovery.models import DestinationRow
from app.features.profiles.models import User
from app.features.trips.models import TripRow
from app.db.registry import Base
from app.integrations.cache import PlaceCache, PlaceCacheRow
from tests.conftest import auth_headers


def test_database_url_is_required(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_sqlite_url_is_rejected(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite+aiosqlite:///./wayfare.db")
    with pytest.raises(ValidationError, match="PostgreSQL"):
        Settings(_env_file=None)


@pytest.mark.parametrize("scheme", ["postgres", "postgresql", "postgresql+psycopg"])
def test_postgres_urls_preserve_ssl_options(scheme):
    url = f"{scheme}://user:password@db.neon.tech/wayfare?sslmode=require&channel_binding=require"
    assert Settings(database_url=url, _env_file=None).database_url == url
    assert normalize_url(url) == "postgresql+psycopg://user:password@db.neon.tech/wayfare?sslmode=require&channel_binding=require"


@pytest.mark.parametrize("url", ["", "mysql://host/wayfare", "sqlite:///wayfare", "postgresql+asyncpg://host/wayfare"])
def test_non_postgres_urls_are_rejected(url):
    with pytest.raises(ValidationError, match="PostgreSQL"):
        Settings(database_url=url, _env_file=None)


async def test_init_creates_tables_seeds_catalog_and_refuses_to_run_again(empty_database):
    await initialize(seed=True)
    async with get_sessionmaker()() as session:
        ids = set((await session.execute(select(DestinationRow.id))).scalars())
    assert ids

    with pytest.raises(SystemExit, match="already has application tables"):
        await initialize(seed=False)


async def test_init_without_seed_and_api_restart_preserve_a_saved_trip(empty_database):
    await initialize(seed=False)
    async with get_engine().connect() as conn:
        assert set(await conn.run_sync(lambda sync: inspect(sync).get_table_names())) == set(Base.metadata.tables)
    async with get_sessionmaker()() as session:
        assert not (await session.execute(select(DestinationRow))).scalars().all()

    from app.main import create_app
    from app.bootstrap.seed import demo_trip
    from app.features.trips.repository import stage_trip
    from app.integrations.places.catalog import CatalogPlaceProvider
    from app.integrations.routing.estimates import EstimateTravelRouter
    from app.integrations.services import Services
    import httpx

    async def started_app():
        services = Services(CatalogPlaceProvider(), EstimateTravelRouter(), None, PlaceCache(get_sessionmaker(), 60))
        return create_app(services)

    first = await started_app()
    async with first.router.lifespan_context(first):
        async with get_sessionmaker()() as session:
            assert (await session.execute(select(DestinationRow))).scalars().all()
            session.add(User(id="u-restart", clerk_user_id="user_restart", name="Restart check", default_prefs={}))
            await session.flush()
            trip = demo_trip()
            stage_trip(session, "u-restart", trip)
            await session.commit()

    second = await started_app()
    async with second.router.lifespan_context(second):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=second), base_url="http://test") as client:
            response = await client.get(f"/trips/{trip.id}", headers=auth_headers("user_restart"))
        assert response.status_code == 200
        assert response.json() == trip.dump()


async def test_init_refuses_partial_schema_without_creating_other_tables(empty_database):
    async with get_engine().begin() as conn:
        await conn.run_sync(lambda sync: User.__table__.create(sync))
    with pytest.raises(SystemExit, match="already has application tables"):
        await initialize(seed=True)
    async with get_engine().connect() as conn:
        assert await conn.run_sync(lambda sync: inspect(sync).get_table_names()) == ["users"]


async def test_api_startup_does_not_initialize_an_empty_database(empty_database):
    from app.main import create_app
    from app.integrations.places.catalog import CatalogPlaceProvider
    from app.integrations.routing.estimates import EstimateTravelRouter
    from app.integrations.services import Services

    services = Services(CatalogPlaceProvider(), EstimateTravelRouter(), None, PlaceCache(get_sessionmaker(), 60))
    app = create_app(services)
    with pytest.raises(ProgrammingError, match="destinations"):
        async with app.router.lifespan_context(app):
            pass
    async with get_engine().connect() as conn:
        assert await conn.run_sync(lambda sync: inspect(sync).get_table_names()) == []


async def test_jsonb_and_timestamptz_survive_a_new_connection(fresh_database):
    async with get_engine().connect() as conn:
        columns = await conn.run_sync(lambda sync: {c["name"]: c for c in inspect(sync).get_columns("users")})
    assert columns["default_prefs"]["type"].__visit_name__ == "JSONB"
    assert columns["created_at"]["type"].timezone is True

    async with get_sessionmaker()() as session:
        session.add(User(id="u1", clerk_user_id="user_ada", name="Ada", default_prefs={"pace": "balanced", "interests": ["food"]}))
        await session.commit()
    await dispose_engine()

    async with get_sessionmaker()() as session:
        row = await session.get(User, "u1")
        assert row is not None
        assert row.default_prefs["interests"] == ["food"]
        assert row.created_at.tzinfo is not None


async def test_deleting_a_trip_removes_its_proposals(fresh_database):
    async with get_sessionmaker()() as session:
        session.add(User(id="u1", clerk_user_id="user_ada", name="Ada", default_prefs={}))
        await session.flush()
        session.add(TripRow(
            id="t1", user_id="u1", destination_id="nyc", destination="New York", country="USA", image="",
            start_date="2026-11-01", end_date="2026-11-05", travelers=1, prefs={}, days=[],
        ))
        await session.flush()
        session.add(ProposalRow(
            id="p1", trip_id="t1", day_index=0, kind="relaxed", base_version=1, day={"activities": []},
            changes=[], expires_at=utcnow() + timedelta(minutes=30),
        ))
        await session.commit()

    async with get_sessionmaker()() as session:
        trip = await session.get(TripRow, "t1")
        assert trip is not None
        await session.delete(trip)
        await session.commit()

    async with get_sessionmaker()() as session:
        assert await session.get(ProposalRow, "p1") is None


async def test_cache_expiry_compares_postgres_aware_timestamps(fresh_database):
    cache = PlaceCache(get_sessionmaker(), 60)
    await cache.set("fresh", {"nested": [1, {"ok": True}]})
    async with get_sessionmaker()() as session:
        session.add(PlaceCacheRow(key="expired", payload=[{"id": "old"}], expires_at=utcnow() - timedelta(seconds=1)))
        await session.commit()
    await dispose_engine()
    cache = PlaceCache(get_sessionmaker(), 60)
    assert await cache.get("fresh") == {"nested": [1, {"ok": True}]}
    assert await cache.get("expired") is None
