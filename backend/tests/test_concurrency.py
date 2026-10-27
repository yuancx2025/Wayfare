"""Proposal apply is atomic against real PostgreSQL: one version check, one write, one proposal delete, one commit."""

import asyncio

import pytest

from app.db.session import get_sessionmaker
from app.features.adjustments import repository as adjustments_repository
from app.features.adjustments.models import ProposalRow
from app.features.trips import repository as trips_repository


def hold_writes_until_both_arrive(monkeypatch) -> None:
    """Both requests pass every read-side check before either one writes."""
    arrived = 0
    both_read = asyncio.Event()
    original = trips_repository.apply_day_if_version

    async def synchronized(session, user_id, trip_id, days, expected):
        nonlocal arrived
        arrived += 1
        if arrived == 2:
            both_read.set()
        # Waiting before the UPDATE means neither request holds the trip row lock here.
        await asyncio.wait_for(both_read.wait(), 5)
        return await original(session, user_id, trip_id, days, expected)

    monkeypatch.setattr(trips_repository, "apply_day_if_version", synchronized)


async def preview(client, tid: str, day: int) -> dict:
    response = await client.post(f"/trips/{tid}/days/{day}/proposals", json={"kind": "relaxed"})
    assert response.status_code == 200
    return response.json()


async def test_concurrent_proposals_allow_only_one_apply(make_client, monkeypatch):
    client = await make_client()
    [seed] = (await client.get("/trips")).json()
    tid = seed["id"]
    before = (await client.get(f"/trips/{tid}")).json()
    proposals = [await preview(client, tid, 0), await preview(client, tid, 1)]

    hold_writes_until_both_arrive(monkeypatch)
    responses = await asyncio.gather(*(
        client.post(f"/trips/{tid}/proposals/{p['proposalId']}/apply") for p in proposals
    ))

    assert sorted(r.status_code for r in responses) == [200, 409]
    winner_index = next(i for i, r in enumerate(responses) if r.status_code == 200)
    winner, loser = proposals[winner_index], proposals[1 - winner_index]
    after = (await client.get(f"/trips/{tid}")).json()
    assert after["version"] == before["version"] + 1
    assert after["days"][winner["day"]["index"]] == winner["day"]
    assert after["days"][loser["day"]["index"]] == before["days"][loser["day"]["index"]]


async def test_applying_one_proposal_twice_at_once_writes_once(make_client, monkeypatch):
    client = await make_client()
    [seed] = (await client.get("/trips")).json()
    tid = seed["id"]
    before = (await client.get(f"/trips/{tid}")).json()
    pid = (await preview(client, tid, 0))["proposalId"]

    hold_writes_until_both_arrive(monkeypatch)
    responses = await asyncio.gather(*(client.post(f"/trips/{tid}/proposals/{pid}/apply") for _ in range(2)))

    statuses = sorted(r.status_code for r in responses)
    assert statuses[0] == 200 and statuses[1] in {404, 409, 410}
    assert (await client.get(f"/trips/{tid}")).json()["version"] == before["version"] + 1


async def test_failed_proposal_delete_rolls_back_the_day_write(make_client, monkeypatch):
    client = await make_client()
    [seed] = (await client.get("/trips")).json()
    tid = seed["id"]
    before = (await client.get(f"/trips/{tid}")).json()
    pid = (await preview(client, tid, 0))["proposalId"]

    async def fail(session, trip_id, proposal_id):
        raise RuntimeError("proposal delete failed")

    original = adjustments_repository.consume_proposal
    monkeypatch.setattr(adjustments_repository, "consume_proposal", fail)
    with pytest.raises(RuntimeError, match="proposal delete failed"):
        await client.post(f"/trips/{tid}/proposals/{pid}/apply")
    monkeypatch.setattr(adjustments_repository, "consume_proposal", original)

    assert (await client.get(f"/trips/{tid}")).json() == before
    async with get_sessionmaker()() as session:
        assert await session.get(ProposalRow, pid) is not None
    retried = await client.post(f"/trips/{tid}/proposals/{pid}/apply")
    assert retried.status_code == 200 and retried.json()["version"] == before["version"] + 1


async def test_another_user_cannot_apply_a_proposal(make_client):
    client = await make_client()
    [seed] = (await client.get("/trips")).json()
    tid = seed["id"]
    before = (await client.get(f"/trips/{tid}")).json()
    pid = (await preview(client, tid, 0))["proposalId"]

    response = await client.post(f"/trips/{tid}/proposals/{pid}/apply", headers={"X-User-Id": "someone-else"})
    assert response.status_code == 404
    assert (await client.get(f"/trips/{tid}")).json() == before
    async with get_sessionmaker()() as session:
        assert await session.get(ProposalRow, pid) is not None
