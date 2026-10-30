from datetime import datetime

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, utcnow


class User(Base):
    __tablename__ = "users"

    # Internal id ("u-…"). Trips reference this, never the Clerk id.
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    # The session token's `sub` ("user_…").
    clerk_user_id: Mapped[str] = mapped_column(String(64), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    home: Mapped[str] = mapped_column(String(120), default="")
    traveling_since: Mapped[int | None] = mapped_column(Integer, nullable=True)
    default_prefs: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
