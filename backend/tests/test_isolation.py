"""One account can never read or change another account's trips. Uses real signed tokens."""

import asyncio

from sqlalchemy import select

from app.db.session import get_sessionmaker
from app.features.profiles.models import User
from tests.conftest import add_demo_trip, auth_headers
from tests.test_api import DRAFT, generate


async def test_another_account_gets_404_for_every_trip_route(make_client):
    a = await make_client(sub="user_a")
    b = await make_client(sub="user_b")
    trip = (await a.get(f"/trips/{(await add_demo_trip(a))['id']}")).json()
    tid, aid = trip["id"], trip["days"][0]["activities"][0]["id"]
    proposal = (await a.post(f"/trips/{tid}/days/0/proposals", json={"kind": "relaxed"})).json()

    attempts = {
        "trip": b.get(f"/trips/{tid}"),
        "day route": b.get(f"/trips/{tid}/days/0/route"),
        "alternatives": b.get(f"/trips/{tid}/days/0/activities/{aid}/alternatives"),
        "proposal": b.post(f"/trips/{tid}/days/0/proposals", json={"kind": "relaxed"}),
        "apply": b.post(f"/trips/{tid}/proposals/{proposal['proposalId']}/apply"),
        "delete": b.delete(f"/trips/{tid}"),
    }
    for route, call in attempts.items():
        assert (await call).status_code == 404, route

    assert (await b.get("/trips")).json() == []
    assert (await a.get(f"/trips/{tid}")).json() == trip
    applied = await a.post(f"/trips/{tid}/proposals/{proposal['proposalId']}/apply")
    assert applied.status_code == 200, "B's attempt did not consume A's proposal"


async def test_idempotency_keys_are_scoped_per_account(make_client):
    a = await make_client(sub="user_a")
    b = await make_client(sub="user_b")
    _, a_events = await generate(a, DRAFT, key="shared-key")
    _, b_events = await generate(b, DRAFT, key="shared-key")
    a_trip, b_trip = a_events[-1][1]["trip"], b_events[-1][1]["trip"]

    assert a_trip["id"] != b_trip["id"]
    assert [t["id"] for t in (await a.get("/trips")).json()] == [a_trip["id"]]
    assert [t["id"] for t in (await b.get("/trips")).json()] == [b_trip["id"]]


async def test_concurrent_first_requests_create_one_user(make_client):
    client = await make_client(sub=None)
    headers = auth_headers("user_racer", name="Racer")
    paths = ["/me", "/trips", "/me/preferences", "/trips", "/me", "/me/preferences"]
    responses = await asyncio.gather(*(client.get(path, headers=headers) for path in paths))
    assert [r.status_code for r in responses] == [200] * len(paths)

    async with get_sessionmaker()() as session:
        rows = list((await session.execute(select(User).where(User.clerk_user_id == "user_racer"))).scalars())
    assert len(rows) == 1
