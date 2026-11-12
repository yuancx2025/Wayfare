import hashlib
import json
from datetime import datetime, timedelta

from sqlalchemy import DateTime, String, select
from sqlalchemy.dialects.postgresql import JSONB, insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, utcnow


class PlaceCacheRow(Base):
    """Short-lived cache of Google responses. Only place IDs are stored long-term elsewhere (Maps Platform terms)."""

    __tablename__ = "place_cache"

    key: Mapped[str] = mapped_column(String(512), primary_key=True)
    payload: Mapped[dict | list] = mapped_column(JSONB)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


def cache_key(*parts) -> str:
    raw = json.dumps(parts, sort_keys=True, default=str)
    return f"{parts[0]}:{hashlib.sha1(raw.encode()).hexdigest()}"


class PlaceCache:
    """TTL cache for Google responses, backed by the `place_cache` table with its own short sessions."""

    def __init__(self, sessionmaker: async_sessionmaker[AsyncSession], ttl_s: int):
        self._sm = sessionmaker
        self._ttl = ttl_s

    async def get(self, key: str):
        async with self._sm() as s:
            row = await s.get(PlaceCacheRow, key)
            if row and row.expires_at > utcnow():
                return row.payload
            return None

    async def get_many(self, keys: list[str]) -> dict[str, dict | list]:
        """Unexpired payloads for whichever `keys` are cached, in one query."""
        if not keys:
            return {}
        async with self._sm() as s:
            rows = await s.scalars(select(PlaceCacheRow).where(PlaceCacheRow.key.in_(keys), PlaceCacheRow.expires_at > utcnow()))
            return {row.key: row.payload for row in rows}

    async def set_many(self, items: dict[str, dict | list], ttl_s: int | None = None) -> None:
        """Upserts every entry in one statement."""
        if not items:
            return
        expires = utcnow() + timedelta(seconds=ttl_s or self._ttl)
        stmt = insert(PlaceCacheRow).values([{"key": k, "payload": v, "expires_at": expires} for k, v in items.items()])
        stmt = stmt.on_conflict_do_update(
            index_elements=[PlaceCacheRow.key], set_={"payload": stmt.excluded.payload, "expires_at": stmt.excluded.expires_at},
        )
        async with self._sm() as s:
            await s.execute(stmt)
            await s.commit()

    async def set(self, key: str, payload, ttl_s: int | None = None) -> None:
        async with self._sm() as s:
            row = await s.get(PlaceCacheRow, key)
            expires = utcnow() + timedelta(seconds=ttl_s or self._ttl)
            if row:
                row.payload, row.expires_at = payload, expires
            else:
                s.add(PlaceCacheRow(key=key, payload=payload, expires_at=expires))
            await s.commit()
