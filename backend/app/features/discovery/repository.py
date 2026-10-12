from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.contracts.travel import Destination, LatLng, Viewport
from app.features.discovery.models import DestinationRow


def destination_from_row(row: DestinationRow) -> Destination:
    return Destination(
        id=row.id, name=row.name, country=row.country, image=row.image, blurb=row.blurb, best_for=row.best_for,
        center=LatLng(lat=row.center_lat, lng=row.center_lng), place_id=row.place_id,
        viewport=Viewport.model_validate(row.viewport) if row.viewport else None,
    )


async def seed_catalog_destinations(session: AsyncSession, destinations: list[Destination]) -> None:
    existing = set((await session.execute(select(DestinationRow.id))).scalars())
    for d in destinations:
        if d.id not in existing:
            session.add(DestinationRow(
                id=d.id, name=d.name, country=d.country, image=d.image, blurb=d.blurb, best_for=list(d.best_for),
                center_lat=d.center.lat, center_lng=d.center.lng, curated=True,
            ))
    await session.commit()


async def get_destination(session: AsyncSession, id_or_place_id: str) -> Destination | None:
    row = await session.get(DestinationRow, id_or_place_id)
    if row is None:
        res = await session.execute(select(DestinationRow).where(DestinationRow.place_id == id_or_place_id))
        row = res.scalar_one_or_none()
    return destination_from_row(row) if row else None


async def find_destination_by_name(session: AsyncSession, text: str) -> Destination | None:
    q = text.strip().lower()
    res = await session.execute(select(DestinationRow))
    for row in res.scalars():
        if q == row.id or q.startswith(row.name.lower()) or f"{row.name}, {row.country}".lower() == q:
            return destination_from_row(row)
    return None


async def upsert_destination(session: AsyncSession, dest: Destination, curated: bool = False) -> Destination:
    row = await session.get(DestinationRow, dest.id)
    if row is None and dest.place_id:
        res = await session.execute(select(DestinationRow).where(DestinationRow.place_id == dest.place_id))
        row = res.scalar_one_or_none()
    if row is None:
        row = DestinationRow(id=dest.id, curated=curated, center_lat=dest.center.lat, center_lng=dest.center.lng)
        session.add(row)
    row.place_id = dest.place_id or row.place_id
    row.name, row.country = dest.name, dest.country
    row.image = dest.image or row.image
    row.blurb = dest.blurb or row.blurb
    row.best_for = list(dest.best_for) or row.best_for or []
    row.center_lat, row.center_lng = dest.center.lat, dest.center.lng
    row.viewport = dest.viewport.dump() if dest.viewport else row.viewport
    await session.commit()
    return destination_from_row(row)


async def search_destinations(session: AsyncSession, q: str) -> list[Destination]:
    stmt = select(DestinationRow).order_by(DestinationRow.curated.desc(), DestinationRow.created_at)
    query = q.strip().lower()
    if query:
        like = f"%{query}%"
        stmt = stmt.where(or_(
            func.lower(DestinationRow.name).like(like), func.lower(DestinationRow.country).like(like),
            func.lower(DestinationRow.blurb).like(like),
        ))
    rows = list((await session.execute(stmt)).scalars())
    if query:
        # best_for is JSONB; match it in Python so a partial tag still finds the destination.
        all_rows = list((await session.execute(select(DestinationRow).order_by(DestinationRow.curated.desc()))).scalars())
        seen = {r.id for r in rows}
        rows += [r for r in all_rows if r.id not in seen and any(query in b for b in r.best_for)]
    return [destination_from_row(r) for r in rows]
