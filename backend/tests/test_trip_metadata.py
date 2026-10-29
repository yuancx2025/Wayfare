"""Metadata is an owned, independent write over real PostgreSQL, not a full-trip replacement."""

import asyncio
from pathlib import Path

import pytest
from sqlalchemy import text

from app.db.session import get_engine
from app.features.trips import repository


async def seed_trip(client):
    [summary] = (await client.get("/trips")).json()
    return (await client.get(f"/trips/{summary['id']}")).json()


async def test_favorite_survives_new_app_and_does_not_change_the_itinerary(make_client):
    client = await make_client()
    before = await seed_trip(client)
    tid = before["id"]
    assert before["isFavorite"] is False and before["visited"] is False
    for _ in range(2):
        response = await client.patch(f"/trips/{tid}", json={"isFavorite": True})
        assert response.status_code == 200
        assert response.json() == {"id": tid, "isFavorite": True, "visited": False}
    restarted = await make_client()
    assert (await restarted.get(f"/trips/{tid}")).json() == {**before, "isFavorite": True}
    [summary] = (await restarted.get("/trips")).json()
    assert summary["isFavorite"] is True
    assert (await restarted.patch(f"/trips/{tid}", json={"isFavorite": False})).status_code == 200
    assert (await restarted.get(f"/trips/{tid}")).json() == before


@pytest.mark.parametrize("patch", [
    {}, {"isFavorite": None}, {"visited": None}, {"isFavorite": 1}, {"visited": "false"},
    {"version": 3}, {"days": []}, {"isFavorite": True, "unknown": True},
])
async def test_metadata_rejects_non_boolean_or_itinerary_input(make_client, patch):
    client = await make_client()
    before = await seed_trip(client)
    assert (await client.patch(f"/trips/{before['id']}", json=patch)).status_code == 422
    assert (await client.get(f"/trips/{before['id']}")).json() == before


async def test_metadata_owner_predicate_returns_404_for_foreign_and_missing_trips(make_client):
    client = await make_client()
    before = await seed_trip(client)
    for tid, headers in [(before["id"], {"X-User-Id": "another-user"}), ("missing-trip", {})]:
        response = await client.patch(f"/trips/{tid}", json={"isFavorite": True}, headers=headers)
        assert response.status_code == 404
    assert (await client.get(f"/trips/{before['id']}")).json() == before


async def test_metadata_preserves_valid_adjustment_proposals(make_client):
    client = await make_client()
    before = await seed_trip(client)
    tid = before["id"]
    preview = (await client.post(f"/trips/{tid}/days/0/proposals", json={"kind": "relaxed"})).json()
    assert (await client.patch(f"/trips/{tid}", json={"isFavorite": True, "visited": True})).status_code == 200
    response = await client.post(f"/trips/{tid}/proposals/{preview['proposalId']}/apply")
    assert response.status_code == 200
    assert response.json()["version"] == before["version"] + 1
    assert response.json()["isFavorite"] is True and response.json()["visited"] is True


async def test_simultaneous_metadata_and_itinerary_writes_keep_both_changes(make_client, monkeypatch):
    client = await make_client()
    before = await seed_trip(client)
    tid = before["id"]
    preview = (await client.post(f"/trips/{tid}/days/0/proposals", json={"kind": "relaxed"})).json()
    arrived = 0
    ready = asyncio.Event()

    def synchronized(original):
        async def write(*args, **kwargs):
            nonlocal arrived
            arrived += 1
            if arrived == 2:
                ready.set()
            await asyncio.wait_for(ready.wait(), 5)
            return await original(*args, **kwargs)
        return write

    monkeypatch.setattr(repository, "update_metadata", synchronized(repository.update_metadata))
    monkeypatch.setattr(repository, "apply_day_if_version", synchronized(repository.apply_day_if_version))
    responses = await asyncio.gather(
        client.patch(f"/trips/{tid}", json={"isFavorite": True}),
        client.post(f"/trips/{tid}/proposals/{preview['proposalId']}/apply"),
    )
    assert [response.status_code for response in responses] == [200, 200]
    after = (await client.get(f"/trips/{tid}")).json()
    assert after["isFavorite"] is True and after["visited"] is False
    assert after["days"][0] == preview["day"] and after["version"] == before["version"] + 1


async def test_partial_metadata_writes_do_not_replace_other_metadata(make_client):
    client = await make_client()
    tid = (await seed_trip(client))["id"]
    responses = await asyncio.gather(
        client.patch(f"/trips/{tid}", json={"isFavorite": True}),
        client.patch(f"/trips/{tid}", json={"visited": True}),
    )
    assert all(response.status_code == 200 for response in responses)
    after = (await client.get(f"/trips/{tid}")).json()
    assert after["isFavorite"] is True and after["visited"] is True


async def test_failed_metadata_transaction_rolls_back(make_client, monkeypatch):
    client = await make_client()
    before = await seed_trip(client)
    original = repository.update_metadata

    async def fail(*args, **kwargs):
        await original(*args, **kwargs)
        raise RuntimeError("write interrupted")

    monkeypatch.setattr(repository, "update_metadata", fail)
    with pytest.raises(RuntimeError, match="write interrupted"):
        await client.patch(f"/trips/{before['id']}", json={"isFavorite": True})
    monkeypatch.setattr(repository, "update_metadata", original)
    assert (await client.get(f"/trips/{before['id']}")).json() == before


async def test_legacy_upgrade_preserves_existing_rows_and_versions(make_client):
    client = await make_client()
    before = await seed_trip(client)
    script = Path(__file__).parents[1] / "scripts/sql/001_trip_collection_metadata.sql"
    async with get_engine().begin() as connection:
        await connection.execute(text("ALTER TABLE trips DROP COLUMN is_favorite, DROP COLUMN visited"))
        await connection.execute(text(script.read_text()))
    assert (await client.get(f"/trips/{before['id']}")).json() == before
