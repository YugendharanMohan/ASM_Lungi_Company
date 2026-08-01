from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Loom(Base):
    """A loom, always belonging to exactly one shed.

    Loom numbers are unique *within* a shed, not globally — shed A and shed B
    may both have a loom 1, which is how the floor actually labels them.
    """

    __tablename__ = "looms"
    __table_args__ = (
        UniqueConstraint("shed_id", "loom_number", name="uq_loom_per_shed"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    loom_number: Mapped[str] = mapped_column(String(40), index=True)
    shed_id: Mapped[int] = mapped_column(
        ForeignKey("sheds.id", ondelete="CASCADE"), index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    shed = relationship("Shed", back_populates="looms")
