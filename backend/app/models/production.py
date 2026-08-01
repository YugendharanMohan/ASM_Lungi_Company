import enum
from datetime import date, datetime, timezone

from sqlalchemy import (
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Numeric,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Shift(str, enum.Enum):
    DAY = "DAY"
    NIGHT = "NIGHT"


class PickType(str, enum.Enum):
    """Reed/pick count of the cloth being woven.

    Each pick carries its own piece rate, and the rate is typed in per entry
    rather than looked up — rates move with the market and with the customer,
    and the person at the desk knows the number for that day's cloth.
    """

    P88X96 = "88x96"
    P88X92 = "88x92"
    P88X80 = "88x80"


class ProductionEntry(Base):
    """One meter reading for one worker, on one loom, for one shift.

    The uniqueness rule is enforced by a database constraint rather than a
    read-then-write check in the route: two operators submitting the same entry
    at the same moment would both pass a pre-check and both insert. The
    constraint makes the second insert fail no matter how the race is timed.
    """

    __tablename__ = "production_entries"
    __table_args__ = (
        UniqueConstraint(
            "entry_date",
            "shift",
            "worker_id",
            "loom_id",
            name="uq_production_worker_loom_date_shift",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    entry_date: Mapped[date] = mapped_column(Date, index=True)
    shift: Mapped[Shift] = mapped_column(
        Enum(Shift, native_enum=False, length=8), default=Shift.DAY
    )
    pick_type: Mapped[PickType] = mapped_column(
        Enum(PickType, native_enum=False, length=12), default=PickType.P88X96
    )
    worker_id: Mapped[int] = mapped_column(
        ForeignKey("workers.id", ondelete="CASCADE"), index=True
    )
    loom_id: Mapped[int] = mapped_column(
        ForeignKey("looms.id", ondelete="CASCADE"), index=True
    )
    meters: Mapped[float] = mapped_column(Numeric(10, 2), default=0)

    # The rate is copied onto the entry rather than read through to the worker.
    # A worker's rate changes over time; historical wages must not silently
    # recalculate when it does.
    rate_per_meter: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    total_amount: Mapped[float] = mapped_column(Numeric(12, 2), default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    worker = relationship("Worker")
    loom = relationship("Loom")
