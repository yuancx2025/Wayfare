from collections.abc import Callable, Iterator
from typing import Any

import httpx
import pytest
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage
from langchain_core.runnables import RunnableLambda

from app.core.config import get_settings
from app.integrations.cache import PlaceCache
from app.db.session import dispose_engine, get_sessionmaker
from tests.postgres import empty_database, fresh_database

__all__ = ["empty_database", "fresh_database"]
from app.main import create_app
from app.integrations.places.catalog import CatalogPlaceProvider
from app.integrations.routing.estimates import EstimateTravelRouter
from app.integrations.services import Services


class FakeStructuredLLM(GenericFakeChatModel):
    """GenericFakeChatModel that also answers `with_structured_output` calls from a queue of callables/objects."""

    structured: list[Any] = []
    tool_calls_ok: bool = False
    seen: list[Any] = []

    def with_structured_output(self, schema, **kwargs):  # type: ignore[override]
        def respond(messages):
            self.seen.append(messages)
            item = self.structured.pop(0)
            return item(messages) if callable(item) and not isinstance(item, type) else item

        return RunnableLambda(respond)

    def bind_tools(self, tools, **kwargs):  # type: ignore[override]
        if not self.tool_calls_ok:
            raise NotImplementedError
        return self


def fake_llm(structured: list[Any] | None = None, messages: Iterator[AIMessage] | None = None, tools: bool = False) -> FakeStructuredLLM:
    return FakeStructuredLLM(messages=messages or iter([]), structured=list(structured or []), tool_calls_ok=tools, seen=[])


class FixedRouter(EstimateTravelRouter):
    """Pretends to be the Routes API: every leg takes `minutes`."""

    source = "google"

    def __init__(self, minutes: int = 7):
        self.minutes, self.calls = minutes, 0

    async def pair_times(self, pairs, mode):
        self.calls += 1
        return [(self.minutes, 1.0) for _ in pairs]

    async def leg_polyline(self, a, b, mode):
        return "encoded~poly"


@pytest.fixture
async def make_client(fresh_database) -> Callable:
    """Builds an API client over the disposable Postgres database with injectable services."""
    opened: list = []

    async def factory(llm=None, router=None, places=None) -> httpx.AsyncClient:
        await dispose_engine()
        services = Services(
            places=places or CatalogPlaceProvider(), router=router or EstimateTravelRouter(), llm=llm,
            cache=PlaceCache(get_sessionmaker(), 600),
        )
        app = create_app(services)
        ctx = app.router.lifespan_context(app)
        await ctx.__aenter__()
        client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", headers={"X-User-Id": "tester-1"})
        opened.append((client, ctx))
        return client

    yield factory
    for client, ctx in opened:
        await client.aclose()
        await ctx.__aexit__(None, None, None)
    await dispose_engine()
    get_settings.cache_clear()


@pytest.fixture
async def catalog_services(fresh_database) -> Services:
    """Services for calling planner functions directly (no HTTP)."""
    yield Services(places=CatalogPlaceProvider(), router=EstimateTravelRouter(), llm=None, cache=PlaceCache(get_sessionmaker(), 600))
