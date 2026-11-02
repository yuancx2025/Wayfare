import time
from collections.abc import Callable, Iterator
from typing import Any

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage
from langchain_core.runnables import RunnableLambda

from app.core.config import get_settings
from app.integrations.cache import PlaceCache
from app.db.session import dispose_engine, get_sessionmaker
from tests.postgres import empty_database, fresh_database

__all__ = ["empty_database", "fresh_database"]
from app.bootstrap.seed import demo_trip
from app.features.trips.repository import save_trip
from app.main import create_app
from app.integrations.places.catalog import CatalogPlaceProvider
from app.integrations.routing.estimates import EstimateTravelRouter
from app.integrations.services import Services

TEST_ISSUER = "https://wayfare-test.clerk.accounts.dev"
TEST_SIGNING_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
TEST_JWT_KEY = TEST_SIGNING_KEY.public_key().public_bytes(
    serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo,
).decode()
DEFAULT_SUB = "user_tester1"


def session_token(sub: str = DEFAULT_SUB, *, issuer: str = TEST_ISSUER, key: Any = TEST_SIGNING_KEY, expires_in: int = 60, **claims) -> str:
    """A Clerk-shaped session JWT signed with the test key (or `key`)."""
    now = int(time.time())
    payload = {"iss": issuer, "sub": sub, "sid": f"sess_{sub}", "iat": now - 5, "nbf": now - 10, "exp": now + expires_in, "v": 2, **claims}
    return jwt.encode(payload, key, algorithm="RS256", headers={"kid": "ins_test"})


def auth_headers(sub: str = DEFAULT_SUB, **claims) -> dict[str, str]:
    return {"Authorization": f"Bearer {session_token(sub, **claims)}"}


class SignedIn(httpx.Auth):
    """Mints a fresh token per request, unless the request already carries its own Authorization header."""

    def __init__(self, sub: str, claims: dict[str, Any]):
        self.sub, self.claims = sub, claims

    def auth_flow(self, request):
        if "Authorization" not in request.headers:
            request.headers.update(auth_headers(self.sub, **self.claims))
        yield request


@pytest.fixture(autouse=True)
def clerk_test_keys(monkeypatch):
    """The API verifies tokens against the test key and issuer, never the real Clerk instance."""
    monkeypatch.setenv("CLERK_JWT_KEY", TEST_JWT_KEY)
    monkeypatch.setenv("CLERK_ISSUER", TEST_ISSUER)
    monkeypatch.setenv("CLERK_AUTHORIZED_PARTIES", "[]")
    get_settings.cache_clear()


async def add_demo_trip(client: httpx.AsyncClient) -> dict:
    """Saves the 5-day New York sample trip for the client's account and returns its summary."""
    user_id = (await client.get("/me")).json()["id"]
    async with get_sessionmaker()() as session:
        await save_trip(session, user_id, demo_trip())
    [summary] = [t for t in (await client.get("/trips")).json() if t["destinationId"] == "nyc"]
    return summary


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
    """Builds an API client over the disposable Postgres database with injectable services.

    The client is signed in as `sub` with a test-key session token; `sub=None` sends no token.
    """
    opened: list = []

    async def factory(llm=None, router=None, places=None, sub: str | None = DEFAULT_SUB, **claims) -> httpx.AsyncClient:
        await dispose_engine()
        services = Services(
            places=places or CatalogPlaceProvider(), router=router or EstimateTravelRouter(), llm=llm,
            cache=PlaceCache(get_sessionmaker(), 600),
        )
        app = create_app(services)
        ctx = app.router.lifespan_context(app)
        await ctx.__aenter__()
        client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test", auth=SignedIn(sub, claims) if sub else None,
        )
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
