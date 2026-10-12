"""Keep the documented concurrent-apply gap visible against real PostgreSQL."""

import asyncio

import pytest

from app.features.trips import repository


class ConcurrentApplyRace(AssertionError):
    pass


@pytest.mark.xfail(
    strict=True,
    raises=ConcurrentApplyRace,
    reason="Concurrent proposal apply lacks an atomic version check; both writes can succeed.",
)
async def test_concurrent_proposals_allow_only_one_apply(make_client, monkeypatch):
    client = await make_client()
    [seed] = (await client.get("/trips")).json()
    tid = seed["id"]
    first = await client.post(f"/trips/{tid}/days/0/proposals", json={"kind": "relaxed"})
    second = await client.post(f"/trips/{tid}/days/1/proposals", json={"kind": "relaxed"})
    assert first.status_code == second.status_code == 200
    ids = [first.json()["proposalId"], second.json()["proposalId"]]

    # Force the real rows to have been read by both requests before either commits.
    arrived = 0
    both_read = asyncio.Event()
    original_replace = repository.replace_day

    async def synchronize_writes(session, row, day):
        nonlocal arrived
        arrived += 1
        if arrived == 2:
            both_read.set()
        await asyncio.wait_for(both_read.wait(), 5)
        return await original_replace(session, row, day)

    monkeypatch.setattr(repository, "replace_day", synchronize_writes)
    responses = await asyncio.gather(*(
        client.post(f"/trips/{tid}/proposals/{pid}/apply") for pid in ids
    ))
    statuses = sorted(r.status_code for r in responses)
    if statuses == [200, 200]:
        raise ConcurrentApplyRace("Both concurrent changes were accepted.")
    assert statuses == [200, 409]
