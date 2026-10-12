from datetime import timedelta

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.contracts.travel import Trip
from app.core.config import get_settings
from app.core.ids import new_id
from app.db.base import utcnow
from app.features.adjustments.models import ProposalRow
from app.features.adjustments.schemas import Proposal


async def create_proposal(session: AsyncSession, trip: Trip, kind: str, proposal: Proposal) -> str:
    pid = new_id("prop")
    session.add(ProposalRow(
        id=pid, trip_id=trip.id, day_index=proposal.day.index, kind=kind, base_version=trip.version,
        day=proposal.day.dump(), changes=[c.dump() for c in proposal.changes], new_id=proposal.new_id,
        replaced_id=proposal.replaced_id, expires_at=utcnow() + timedelta(seconds=get_settings().proposal_ttl_s),
    ))
    await session.execute(delete(ProposalRow).where(ProposalRow.expires_at < utcnow()))
    await session.commit()
    return pid


async def get_proposal(session: AsyncSession, trip_id: str, proposal_id: str) -> ProposalRow | None:
    row = await session.get(ProposalRow, proposal_id)
    return row if row and row.trip_id == trip_id else None


async def delete_proposal(session: AsyncSession, row: ProposalRow) -> None:
    await session.delete(row)
    await session.commit()
