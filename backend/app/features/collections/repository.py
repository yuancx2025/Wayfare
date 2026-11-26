import hashlib

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import Conflict
from app.core.ids import new_id
from app.features.collections.models import SavedPlaceRow
from app.features.collections.schemas import SavedPlace, SavedPlaceReference


def saved_place_from_row(row: SavedPlaceRow) -> SavedPlace:
    return SavedPlace(
        id=row.id, provider=row.provider, kind=row.kind, external_id=row.external_id,
        created_at=int(row.created_at.timestamp() * 1000),
    )


async def list_saved_places(session: AsyncSession, user_id: str) -> list[SavedPlaceRow]:
    result = await session.execute(
        select(SavedPlaceRow).where(SavedPlaceRow.user_id == user_id)
        .order_by(SavedPlaceRow.created_at.desc(), SavedPlaceRow.id)
    )
    return list(result.scalars())


async def get_saved_place(session: AsyncSession, user_id: str, saved_id: str) -> SavedPlaceRow | None:
    result = await session.execute(select(SavedPlaceRow).where(SavedPlaceRow.id == saved_id, SavedPlaceRow.user_id == user_id))
    return result.scalar_one_or_none()


async def save_place(session: AsyncSession, user_id: str, reference: SavedPlaceReference) -> SavedPlaceRow:
    """Atomic upsert under the unique owner/reference key; caller commits."""
    identity = {
        "user_id": user_id, "provider": reference.provider, "kind": reference.kind,
        "external_id_hash": hashlib.sha256(reference.external_id.encode("utf-8")).hexdigest(),
    }
    result = await session.execute(
        insert(SavedPlaceRow).values(id=new_id("saved"), external_id=reference.external_id, **identity)
        # A no-op update returns the locked existing row without changing ID or creation time.
        # It also avoids a conflict-then-SELECT race with simultaneous removal.
        .on_conflict_do_update(constraint="uq_saved_places_owner_reference", set_={"id": SavedPlaceRow.id})
        .returning(SavedPlaceRow)
    )
    row = result.scalar_one()
    if row.external_id != reference.external_id:
        # Never treat two distinct opaque IDs as the same reference, even on a hash collision.
        raise Conflict("Saved place identifier conflict")
    return row


async def remove_saved_place(session: AsyncSession, user_id: str, saved_id: str) -> bool:
    result = await session.execute(
        delete(SavedPlaceRow).where(SavedPlaceRow.id == saved_id, SavedPlaceRow.user_id == user_id)
        .returning(SavedPlaceRow.id)
    )
    return result.scalar_one_or_none() is not None
