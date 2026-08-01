from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Worker(Base):
    __tablename__ = "workers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), index=True)
    phone: Mapped[str] = mapped_column(String(20), default="")
    shed_id: Mapped[int | None] = mapped_column(
        ForeignKey("sheds.id", ondelete="SET NULL"), default=None, index=True
    )
    loom_id: Mapped[int | None] = mapped_column(
        ForeignKey("looms.id", ondelete="SET NULL"), default=None, index=True
    )
    # Money and rates use Numeric, never float — 12.35 has no exact binary
    # representation and rounding drift shows up directly in wages paid.
    rate_per_meter: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    shed = relationship("Shed")
    loom = relationship("Loom")
