"""Reference persistence over real PostgreSQL; identity transport is still development-only."""

import asyncio
import hashlib
from pathlib import Path
from types import SimpleNamespace

import pytest
from sqlalchemy import delete, insert, select, text
from sqlalchemy.exc import IntegrityError

from app.db.session import get_engine, get_sessionmaker
from app.features.collections import repository
from app.features.collections.models import SavedPlaceRow
from app.features.profiles.models import User
from app.integrations.places.catalog import CatalogPlaceProvider

REFERENCE = {"provider": "catalog", "kind": "place", "externalId": "ny-met"}
PATH = "/me/saved-places"


async def save(client, reference=None, **kwargs):
    response = await client.post(PATH, json=reference or REFERENCE, **kwargs)
    assert response.status_code == 200, response.text
    return response.json()


async def test_repeat_save_returns_the_existing_record_after_app_restart(make_client):
    client = await make_client()
    assert (await client.get(PATH)).json() == []
    saved = await save(client)
    assert set(saved) == {"id", "provider", "kind", "externalId", "createdAt"}
    assert await save(client) == saved
    restarted = await make_client()
    assert (await restarted.get(PATH)).json() == [saved]
    assert await save(restarted) == saved
    assert (await restarted.delete(f"{PATH}/{saved['id']}")).status_code == 204
    assert (await restarted.get(PATH)).json() == []
    assert (await restarted.delete(f"{PATH}/{saved['id']}")).status_code == 404


async def test_concurrent_saves_use_one_database_record(make_client):
    client = await make_client()
    await client.get(PATH)  # Create the development user before the concurrency boundary.
    responses = await asyncio.gather(*(client.post(PATH, json=REFERENCE) for _ in range(8)))
    assert all(response.status_code == 200 for response in responses)
    assert len({response.json()["id"] for response in responses}) == 1
    assert len((await client.get(PATH)).json()) == 1


async def test_provider_kind_and_case_are_part_of_reference_identity(make_client):
    client = await make_client()
    references = [
        REFERENCE, {**REFERENCE, "provider": "google"}, {**REFERENCE, "kind": "destination"},
        {**REFERENCE, "externalId": "NY-MET"}, {**REFERENCE, "externalId": 'opaque/:?[]"'},
    ]
    saved = [await save(client, reference) for reference in references]
    assert len({item["id"] for item in saved}) == len(references)
    assert len((await client.get(PATH)).json()) == len(references)


async def test_long_opaque_id_is_not_truncated_or_used_as_a_btree_index_value(make_client):
    client = await make_client()
    opaque_id = "".join(hashlib.sha256(str(index).encode()).hexdigest() for index in range(128))
    reference = {**REFERENCE, "provider": "google", "externalId": opaque_id}
    first = await save(client, reference)
    assert first["externalId"] == reference["externalId"]
    assert await save(client, reference) == first


async def test_a_digest_collision_cannot_alias_or_replace_a_different_external_id(make_client, monkeypatch):
    client = await make_client()
    saved = await save(client)
    digest = hashlib.sha256(REFERENCE["externalId"].encode()).hexdigest()
    monkeypatch.setattr(repository, "hashlib", SimpleNamespace(sha256=lambda value: SimpleNamespace(hexdigest=lambda: digest)))
    response = await client.post(PATH, json={**REFERENCE, "externalId": "different-id"})
    assert response.status_code == 409
    assert (await client.get(PATH)).json() == [saved]


@pytest.mark.parametrize("reference", [
    {}, {**REFERENCE, "provider": "other"}, {**REFERENCE, "kind": "activity"},
    {**REFERENCE, "externalId": ""}, {**REFERENCE, "externalId": " ny-met"},
    {**REFERENCE, "externalId": "ny\nmet"}, {**REFERENCE, "externalId": 1},
    {**REFERENCE, "externalId": None}, {**REFERENCE, "userId": "other-user"},
    {**REFERENCE, "name": "Copied response"}, {**REFERENCE, "createdAt": 0},
])
async def test_invalid_input_cannot_create_a_saved_record(make_client, reference):
    client = await make_client()
    assert (await client.post(PATH, json=reference)).status_code == 422
    assert (await client.get(PATH)).json() == []


async def test_current_identity_owns_list_and_delete_predicates(make_client):
    client = await make_client()
    saved = await save(client)
    other = {"X-User-Id": "another-user"}
    assert (await client.get(PATH, headers=other)).json() == []
    assert (await client.delete(f"{PATH}/{saved['id']}", headers=other)).status_code == 404
    assert (await client.delete(f"{PATH}/missing")).status_code == 404
    other_saved = await save(client, headers=other)
    assert other_saved["id"] != saved["id"]
    assert (await client.get(PATH)).json() == [saved]
    assert (await client.get(PATH, headers=other)).json() == [other_saved]


async def test_unavailable_provider_does_not_block_save_list_or_removal(make_client):
    class UnavailablePlaces(CatalogPlaceProvider):
        async def details(self, place_id):
            raise AssertionError("Persistence must not fetch provider details")

        async def resolve_destination(self, place_id):
            raise AssertionError("Persistence must not resolve destinations")

    client = await make_client(places=UnavailablePlaces())
    saved = await save(client, {"provider": "google", "kind": "destination", "externalId": "unavailable-id"})
    assert (await client.get(PATH)).json() == [saved]
    assert (await client.delete(f"{PATH}/{saved['id']}")).status_code == 204


async def test_trip_deletion_preserves_saved_references_and_user_deletion_cascades(make_client):
    client = await make_client()
    saved = await save(client)
    [trip] = (await client.get("/trips")).json()
    assert (await client.delete(f"/trips/{trip['id']}")).status_code == 204
    assert (await client.get(PATH)).json() == [saved]
    async with get_sessionmaker()() as session:
        await session.execute(delete(User).where(User.id == "tester-1"))
        await session.commit()
        assert (await session.execute(select(SavedPlaceRow))).scalars().all() == []


async def test_failed_transaction_does_not_publish_a_saved_reference(make_client, monkeypatch):
    client = await make_client()
    original = repository.save_place

    async def fail(*args, **kwargs):
        await original(*args, **kwargs)
        raise RuntimeError("write interrupted")

    monkeypatch.setattr(repository, "save_place", fail)
    with pytest.raises(RuntimeError, match="write interrupted"):
        await client.post(PATH, json=REFERENCE)
    assert (await client.get(PATH)).json() == []
    monkeypatch.setattr(repository, "save_place", original)
    assert await save(client)


async def test_legacy_upgrade_matches_models_and_preserves_users_and_trips(make_client):
    client = await make_client()
    before = (await client.get("/trips")).json()
    script = Path(__file__).parents[1] / "scripts/sql/002_saved_places.sql"
    async with get_engine().begin() as connection:
        await connection.execute(text("DROP TABLE saved_places"))
        for statement in script.read_text().split(";"):
            if statement.strip():
                await connection.execute(text(statement))
    saved = await save(client)
    assert (await client.get(PATH)).json() == [saved]
    assert (await client.get("/trips")).json() == before
    # The database, not a preceding SELECT, enforces concurrent uniqueness.
    async with get_sessionmaker()() as session:
        row = (await session.execute(select(SavedPlaceRow))).scalar_one()
        duplicate = {column.name: getattr(row, column.name) for column in SavedPlaceRow.__table__.columns}
        duplicate["id"] = "another-row"
        with pytest.raises(IntegrityError):
            await session.execute(insert(SavedPlaceRow).values(**duplicate))
        await session.rollback()
