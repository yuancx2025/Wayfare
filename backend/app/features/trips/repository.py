from datetime import datetime, timezone

from sqlalchemy import Row, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.contracts.travel import Day, Preferences, Trip
from app.db.base import utcnow
from app.features.trips.models import TripRow
from app.features.trips.schemas import TripSummary


def _trip_row(user_id: str, trip: Trip, idempotency_key: str | None) -> TripRow:
    data = trip.dump()
    return TripRow(
        id=trip.id, user_id=user_id, destination_id=trip.destination_id, destination=trip.destination,
        country=trip.country, image=trip.image, start_date=trip.start_date, end_date=trip.end_date,
        travelers=trip.travelers, prefs=data["prefs"], days=data["days"], adjusted=trip.adjusted,
        version=trip.version, idempotency_key=idempotency_key,
        is_favorite=trip.is_favorite, visited=trip.visited,
        created_at=datetime.fromtimestamp(trip.created_at / 1000, tz=timezone.utc),
    )


def trip_from_row(row: TripRow | Row) -> Trip:
    return Trip(
        id=row.id, destination_id=row.destination_id, destination=row.destination, country=row.country,
        image=row.image, start_date=row.start_date, end_date=row.end_date, travelers=row.travelers,
        prefs=Preferences.model_validate(row.prefs), days=[Day.model_validate(d) for d in row.days],
        adjusted=row.adjusted, created_at=int(row.created_at.timestamp() * 1000), version=row.version,
        is_favorite=row.is_favorite, visited=row.visited,
    )


def summary_from_row(row: TripRow) -> TripSummary:
    return TripSummary(
        id=row.id, destination_id=row.destination_id, destination=row.destination, country=row.country,
        image=row.image, start_date=row.start_date, end_date=row.end_date, travelers=row.travelers,
        day_count=len(row.days), stop_count=sum(len(d["activities"]) for d in row.days), adjusted=row.adjusted,
        created_at=int(row.created_at.timestamp() * 1000),
        is_favorite=row.is_favorite, visited=row.visited,
    )


async def list_trip_rows(session: AsyncSession, user_id: str) -> list[TripRow]:
    res = await session.execute(select(TripRow).where(TripRow.user_id == user_id).order_by(TripRow.created_at.desc()))
    return list(res.scalars())


async def get_trip_row(session: AsyncSession, user_id: str, trip_id: str) -> TripRow | None:
    row = await session.get(TripRow, trip_id)
    return row if row and row.user_id == user_id else None


async def find_trip_by_idempotency(session: AsyncSession, user_id: str, key: str) -> TripRow | None:
    res = await session.execute(select(TripRow).where(TripRow.user_id == user_id, TripRow.idempotency_key == key))
    return res.scalar_one_or_none()


def stage_trip(session: AsyncSession, user_id: str, trip: Trip, idempotency_key: str | None = None) -> TripRow:
    """Adds the trip to the session without committing, for callers that own the transaction."""
    row = _trip_row(user_id, trip, idempotency_key)
    session.add(row)
    return row


async def save_trip(session: AsyncSession, user_id: str, trip: Trip, idempotency_key: str | None = None) -> TripRow:
    row = stage_trip(session, user_id, trip, idempotency_key)
    await session.commit()
    return row


async def delete_trip(session: AsyncSession, row: TripRow) -> None:
    # PostgreSQL removes proposals through the foreign key's ON DELETE CASCADE.
    await session.delete(row)
    await session.commit()


async def update_metadata(session: AsyncSession, user_id: str, trip_id: str, patch: dict[str, bool]) -> Row | None:
    """Update only supplied metadata columns under the owner predicate; caller commits."""
    trips = TripRow.__table__
    result = await session.execute(
        update(trips)
        .where(trips.c.id == trip_id, trips.c.user_id == user_id)
        .values(**patch, updated_at=utcnow())
        .returning(trips.c.id, trips.c.is_favorite, trips.c.visited)
    )
    return result.one_or_none()


async def apply_day_if_version(session: AsyncSession, user_id: str, trip_id: str, days: list[dict], expected: int) -> Row | None:
    """Writes `days` only while the stored version is still `expected`. Returns the updated row, or None. Does not commit."""
    trips = TripRow.__table__
    res = await session.execute(
        update(trips)
        .where(trips.c.id == trip_id, trips.c.user_id == user_id, trips.c.version == expected)
        # `onupdate` only runs for ORM flushes, so `updated_at` is set here.
        .values(days=days, adjusted=True, version=trips.c.version + 1, updated_at=utcnow())
        .returning(*trips.c)
    )
    return res.one_or_none()
