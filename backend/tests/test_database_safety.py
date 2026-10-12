"""The destructive database fixtures must reject unsafe connection targets before any reset."""

import pytest

from app.core.config import get_settings
from tests.postgres import require_test_database_url


@pytest.fixture
def configured_database_urls(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://dev:password@ep-example.neon.tech/wayfare")
    monkeypatch.setenv("TEST_DATABASE_URL", "postgresql://test:password@ep-example.neon.tech/wayfare_test?sslmode=require")
    get_settings.cache_clear()
    get_settings()  # Load .env once before tests deliberately remove or replace process values.
    yield
    get_settings.cache_clear()


@pytest.mark.parametrize("value", [None, "", "sqlite:///wayfare_test", "postgresql://test:password@ep-example.neon.tech/wayfare"])
def test_unsafe_test_url_is_rejected(configured_database_urls, monkeypatch, value):
    if value is None:
        monkeypatch.delenv("TEST_DATABASE_URL")
    else:
        monkeypatch.setenv("TEST_DATABASE_URL", value)
    with pytest.raises(pytest.fail.Exception):
        require_test_database_url()


@pytest.mark.parametrize("value", [
    "postgres://another:password@ep-example.neon.tech/wayfare_test?sslmode=require",
    "postgresql+psycopg://test:password@ep-example.neon.tech:5432/wayfare_test?sslmode=require",
    "postgresql://test:password@ep-example-pooler.neon.tech/wayfare_test?sslmode=require",
    "postgresql://test:password@ep-example.neon.tech/wayfare%5Ftest?sslmode=require",
])
def test_equivalent_development_database_is_rejected(configured_database_urls, monkeypatch, value):
    monkeypatch.setenv("DATABASE_URL", "postgresql://dev:password@ep-example.neon.tech/wayfare_test")
    monkeypatch.setenv("TEST_DATABASE_URL", value)
    with pytest.raises(pytest.fail.Exception, match="development"):
        require_test_database_url()


@pytest.mark.parametrize("query", ["dbname=wayfare", "host=production.neon.tech", "service=production"])
def test_connection_target_overrides_are_rejected(configured_database_urls, monkeypatch, query):
    monkeypatch.setenv("TEST_DATABASE_URL", f"postgresql://test:password@ep-example.neon.tech/wayfare_test?{query}")
    with pytest.raises(pytest.fail.Exception, match="overrides"):
        require_test_database_url()


def test_separate_test_database_is_accepted(configured_database_urls):
    assert require_test_database_url().endswith("wayfare_test?sslmode=require")
