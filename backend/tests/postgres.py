"""Disposable PostgreSQL database for tests. Never uses DATABASE_URL."""

import os
from collections.abc import AsyncIterator
from urllib.parse import unquote

import pytest
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError

from app.core.config import get_settings
from app.db.registry import Base
from app.db.session import dispose_engine, get_engine, normalize_url

_POSTGRES_PREFIXES = ("postgres://", "postgresql://", "postgresql+psycopg://")


def database_identity(url: str) -> tuple[str, int, str]:
    """Compare the target database, independent of driver, credentials, and SSL options."""
    try:
        parsed = make_url(normalize_url(url))
        # Connection query overrides could point psycopg at a different database than the URL.
        if set(parsed.query) & {"host", "hostaddr", "port", "dbname", "database", "service"}:
            raise ValueError
        if not parsed.host or not parsed.database:
            raise ValueError
        host = parsed.host.lower().replace("-pooler.", ".")
        return host, parsed.port or 5432, unquote(parsed.database)
    except (ArgumentError, ValueError, TypeError):
        pytest.fail("Database URLs must specify a host and database without connection-target overrides.")


def require_test_database_url() -> str:
    get_settings()
    url = os.environ.get("TEST_DATABASE_URL", "").strip()
    if not url:
        pytest.fail("Set TEST_DATABASE_URL to a disposable PostgreSQL database whose name ends with _test.")
    if not url.startswith(_POSTGRES_PREFIXES):
        pytest.fail("TEST_DATABASE_URL must be a PostgreSQL URL.")
    dev = os.environ.get("DATABASE_URL", "").strip() or get_settings().database_url
    identity = database_identity(url)
    if identity == database_identity(dev):
        pytest.fail("TEST_DATABASE_URL must not be the development DATABASE_URL.")
    if not identity[2].endswith("_test"):
        pytest.fail("TEST_DATABASE_URL database name must end with _test.")
    return url


async def use_test_database(monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", require_test_database_url())
    get_settings.cache_clear()
    await dispose_engine()


async def recreate_tables(*, create: bool) -> None:
    async with get_engine().begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        if create:
            await conn.run_sync(Base.metadata.create_all)


@pytest.fixture
async def empty_database(monkeypatch) -> AsyncIterator[None]:
    """Point the app at the test database and drop every application table."""
    await use_test_database(monkeypatch)
    await recreate_tables(create=False)
    try:
        yield
    finally:
        await dispose_engine()
        get_settings.cache_clear()


@pytest.fixture
async def fresh_database(monkeypatch) -> AsyncIterator[None]:
    """Point the app at the test database and recreate tables from the models."""
    await use_test_database(monkeypatch)
    await recreate_tables(create=True)
    try:
        yield
    finally:
        await dispose_engine()
        get_settings.cache_clear()
