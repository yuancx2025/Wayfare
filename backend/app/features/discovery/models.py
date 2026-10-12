from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, utcnow


class DestinationRow(Base):
    __tablename__ = "destinations"

    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    place_id: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    name: Mapped[str] = mapped_column(String(160))
    country: Mapped[str] = mapped_column(String(160), default="")
    image: Mapped[str] = mapped_column(Text, default="")
    blurb: Mapped[str] = mapped_column(Text, default="")
    best_for: Mapped[list] = mapped_column(JSONB, default=list)
    center_lat: Mapped[float]
    center_lng: Mapped[float]
    viewport: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    curated: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
