from datetime import date, datetime, timezone

from sqlalchemy import Date, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class WorkerLeave(Base):
    """A day a worker did not work.

    Recorded rather than inferred from an empty register. A day with no
    production entries is ambiguous — it could be an absence, or a sheet nobody
    filled in — and that ambiguity is exactly what gets argued about when
    someone questions a week's pay. Storing the absence makes the silence
    deliberate.

    It carries no metres and no money: it exists to say that the blank is
    accounted for.
    """

    __tablename__ = "worker_leave"
    __table_args__ = (
        # One row per worker per day. Marking the same day twice is the same
        # statement, not a second absence.
        UniqueConstraint("worker_id", "leave_date", name="uq_worker_leave_day"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    worker_id: Mapped[int] = mapped_column(
        ForeignKey("workers.id", ondelete="CASCADE"), index=True
    )
    leave_date: Mapped[date] = mapped_column(Date, index=True)
    note: Mapped[str] = mapped_column(String(200), default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
