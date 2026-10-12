from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, utcnow


class TripRow(Base):
    __tablename__ = "trips"
    __table_args__ = (
        UniqueConstraint("user_id", "idempotency_key", name="uq_trips_user_idempotency"),
        Index("ix_trips_user_created", "user_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    destination_id: Mapped[str] = mapped_column(String(120))
    destination: Mapped[str] = mapped_column(String(160))
    country: Mapped[str] = mapped_column(String(160))
    image: Mapped[str] = mapped_column(Text)
    start_date: Mapped[str] = mapped_column(String(10))
    end_date: Mapped[str] = mapped_column(String(10))
    travelers: Mapped[int] = mapped_column(Integer)
    prefs: Mapped[dict] = mapped_column(JSONB)
    days: Mapped[list] = mapped_column(JSONB)
    adjusted: Mapped[bool] = mapped_column(Boolean, default=False)
    version: Mapped[int] = mapped_column(Integer, default=1)
    idempotency_key: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
