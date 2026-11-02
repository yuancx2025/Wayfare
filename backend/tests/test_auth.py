"""Clerk session verification with real RS256 tokens signed by the test key."""

from cryptography.hazmat.primitives.asymmetric import rsa
from sqlalchemy import func, select

from app.db.session import get_sessionmaker
from app.features.profiles.models import User
from tests.conftest import session_token


async def user_rows(clerk_user_id: str) -> list[User]:
    async with get_sessionmaker()() as session:
        return list((await session.execute(select(User).where(User.clerk_user_id == clerk_user_id))).scalars())


async def test_requests_without_a_valid_session_are_rejected(make_client):
    client = await make_client(sub=None)
    other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    rejected = {
        "missing": {},
        "not bearer": {"Authorization": f"Token {session_token()}"},
        "garbage": {"Authorization": "Bearer not.a.jwt"},
        "expired": {"Authorization": f"Bearer {session_token(expires_in=-120)}"},
        "wrong issuer": {"Authorization": f"Bearer {session_token(issuer='https://someone-else.clerk.accounts.dev')}"},
        "wrong key": {"Authorization": f"Bearer {session_token(key=other_key)}"},
    }
    for case, headers in rejected.items():
        response = await client.get("/me", headers=headers)
        assert response.status_code == 401, case
        assert response.headers["www-authenticate"] == "Bearer", case
    async with get_sessionmaker()() as session:
        assert await session.scalar(select(func.count()).select_from(User)) == 0


async def test_public_routes_need_no_token(make_client):
    client = await make_client(sub=None)
    assert (await client.get("/health")).status_code == 200
    assert (await client.get("/places/nyc/photo", follow_redirects=False)).status_code == 302


async def test_a_valid_token_creates_one_user_from_its_claims(make_client):
    client = await make_client(sub="user_valid", email="ada@example.com", name="Ada")
    first = await client.get("/me")
    assert first.status_code == 200
    assert (await client.get("/me")).json()["id"] == first.json()["id"]

    [row] = await user_rows("user_valid")
    assert row.id == first.json()["id"] and row.id.startswith("u-")
    assert (row.name, row.email, row.deleted_at) == ("Ada", "ada@example.com", None)


async def test_a_token_without_custom_claims_still_signs_in(make_client):
    client = await make_client(sub="user_plain")
    me = (await client.get("/me")).json()
    assert me["name"] == "Traveler"
    [row] = await user_rows("user_plain")
    assert row.email is None
