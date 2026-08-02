from datetime import date, datetime, timezone
from enum import Enum

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

#: Cloth leaves the mill in bundles, never as loose pieces. The count is fixed
#: by how the bundles are tied, so it is a constant rather than a setting.
LUNGIS_PER_BUNDLE = 24


class DispatchPick(str, Enum):
    """Picks a consignment can contain.

    Wider than the production :class:`~app.models.production.PickType` — the
    Kambam 88x96 is its own line on the delivery note but is woven on the same
    setting, so the loom floor does not distinguish it.
    """

    P88X96 = "88x96"
    P88X92 = "88x92"
    P88X80 = "88x80"
    P88X96_KAMBAM = "88x96 Kambam"


class Dispatch(Base):
    """A consignment of lungis sent to a customer company."""

    __tablename__ = "dispatches"

    id: Mapped[int] = mapped_column(primary_key=True)
    company_name: Mapped[str] = mapped_column(String(160), index=True)
    dispatch_date: Mapped[date] = mapped_column(Date, index=True)
    #: Total pieces — always ``sum(item.bundles) * LUNGIS_PER_BUNDLE``. Stored
    #: rather than derived on read so the dashboard can sum it in SQL. It is
    #: written in exactly one place (``_recount`` in the route), which is what
    #: keeps it from drifting away from the lines it summarises.
    quantity: Mapped[int] = mapped_column(Integer, default=0)
    remarks: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    items: Mapped[list["DispatchItem"]] = relationship(
        back_populates="dispatch",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="DispatchItem.id",
    )


class DispatchItem(Base):
    """Bundles of one pick within a consignment."""

    __tablename__ = "dispatch_items"
    __table_args__ = (
        # One line per pick. Two rows for the same pick would be two answers to
        # "how many 88x92 went out", and the delivery note shows one.
        UniqueConstraint("dispatch_id", "pick_type", name="uq_dispatch_pick"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    dispatch_id: Mapped[int] = mapped_column(
        ForeignKey("dispatches.id", ondelete="CASCADE"), index=True
    )
    pick_type: Mapped[DispatchPick] = mapped_column(
        SAEnum(DispatchPick, native_enum=False, length=16)
    )
    bundles: Mapped[int] = mapped_column(Integer, default=0)

    dispatch: Mapped[Dispatch] = relationship(back_populates="items")

    @property
    def lungis(self) -> int:
        return self.bundles * LUNGIS_PER_BUNDLE
