from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, utcnow


class SavedPlaceRow(Base):
    __tablename__ = "saved_places"
    __table_args__ = (
        UniqueConstraint("user_id", "provider", "kind", "external_id_hash", name="uq_saved_places_owner_reference"),
        CheckConstraint("provider IN ('catalog', 'google')", name="ck_saved_places_provider"),
        CheckConstraint("kind IN ('destination', 'place')", name="ck_saved_places_kind"),
        CheckConstraint("length(external_id) > 0", name="ck_saved_places_external_id"),
        Index("ix_saved_places_owner_created", "user_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id", ondelete="CASCADE"))
    provider: Mapped[str] = mapped_column(String(7))
    kind: Mapped[str] = mapped_column(String(11))
    external_id: Mapped[str] = mapped_column(Text)
    # A bounded index key keeps long opaque provider IDs out of PostgreSQL's btree size limit.
    external_id_hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
