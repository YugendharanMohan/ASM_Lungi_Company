from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.dispatch import DispatchPick
from app.models.production import PickType, Shift


# --------------------------------------------------------------------------
# Production
# --------------------------------------------------------------------------
class ProductionBase(BaseModel):
    entry_date: date
    shift: Shift = Shift.DAY
    pick_type: PickType = PickType.P88X96
    worker_id: int
    loom_id: int
    meters: float = Field(ge=0)
    rate_per_meter: float = Field(ge=0)


class ProductionCreate(ProductionBase):
    pass


class ProductionUpdate(BaseModel):
    entry_date: date | None = None
    shift: Shift | None = None
    pick_type: PickType | None = None
    worker_id: int | None = None
    loom_id: int | None = None
    meters: float | None = Field(default=None, ge=0)
    rate_per_meter: float | None = Field(default=None, ge=0)


class ProductionOut(ProductionBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    total_amount: float
    created_at: datetime
    worker_name: str = ""
    loom_number: str = ""
    shed_name: str = ""
    loom_label: str = ""


# --------------------------------------------------------------------------
# Dispatch
# --------------------------------------------------------------------------
class DispatchItemIn(BaseModel):
    pick_type: DispatchPick
    bundles: int = Field(ge=0)


class DispatchItemOut(DispatchItemIn):
    model_config = ConfigDict(from_attributes=True)

    #: bundles x LUNGIS_PER_BUNDLE, computed server-side so the delivery note
    #: and the dashboard cannot disagree about what a bundle holds.
    lungis: int


class DispatchBase(BaseModel):
    company_name: str = Field(min_length=1, max_length=160)
    dispatch_date: date
    remarks: str = ""


def _validate_items(items: list[DispatchItemIn]) -> list[DispatchItemIn]:
    picks = [item.pick_type for item in items]
    if len(picks) != len(set(picks)):
        raise ValueError("Each pick can only appear once on a dispatch.")
    if sum(item.bundles for item in items) <= 0:
        raise ValueError("A dispatch needs at least one bundle.")
    # Zero-bundle lines are dropped rather than rejected: the form shows all
    # four picks at once and most consignments only use one or two.
    return [item for item in items if item.bundles > 0]


class DispatchCreate(DispatchBase):
    items: list[DispatchItemIn] = Field(min_length=1)

    @field_validator("items")
    @classmethod
    def check_items(cls, value: list[DispatchItemIn]) -> list[DispatchItemIn]:
        return _validate_items(value)


class DispatchUpdate(BaseModel):
    company_name: str | None = Field(default=None, min_length=1, max_length=160)
    dispatch_date: date | None = None
    remarks: str | None = None
    #: Sent whole or not at all — a partial list of lines has no sensible
    #: meaning, since the absent picks could mean "unchanged" or "removed".
    items: list[DispatchItemIn] | None = None

    @field_validator("items")
    @classmethod
    def check_items(
        cls, value: list[DispatchItemIn] | None
    ) -> list[DispatchItemIn] | None:
        return None if value is None else _validate_items(value)


class DispatchOut(DispatchBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    items: list[DispatchItemOut]
    total_bundles: int
    #: Total pieces across every line.
    quantity: int


# --------------------------------------------------------------------------
# Salary
# --------------------------------------------------------------------------
class SalaryRow(BaseModel):
    worker_id: int
    worker_name: str
    phone: str = ""
    shed_name: str = ""
    total_meters: float
    total_amount: float
    entry_count: int


class SalaryReport(BaseModel):
    period: str
    start_date: date
    end_date: date
    rows: list[SalaryRow]
    total_meters: float
    total_amount: float


# --------------------------------------------------------------------------
# Salary receipt
# --------------------------------------------------------------------------
class RateGroup(BaseModel):
    """Meters that share one piece rate, totalled.

    Wages are checked rate by rate — "220 metres at 9, 340 at 10" — so the
    receipt has to show each rate band on its own line rather than a single
    blended figure nobody can verify.
    """

    rate: float
    pick_types: list[str]
    meters: float
    amount: float


class ReceiptCell(BaseModel):
    loom_label: str
    meters: float | None = None


class ReceiptRow(BaseModel):
    entry_date: date
    cells: list[ReceiptCell]
    total: float


class SalaryReceipt(BaseModel):
    worker_id: int
    worker_name: str
    phone: str = ""
    start_date: date
    end_date: date

    loom_labels: list[str]
    rows: list[ReceiptRow]
    loom_totals: list[ReceiptCell]

    rate_groups: list[RateGroup]
    total_meters: float
    total_amount: float
    average_rate: float


# --------------------------------------------------------------------------
# Dashboard
# --------------------------------------------------------------------------
class DispatchSummaryRow(BaseModel):
    company_name: str
    quantity: int


class DashboardStats(BaseModel):
    today: date
    week_start: date
    week_end: date

    today_meters: float
    today_amount: float
    week_meters: float
    week_amount: float

    total_workers: int
    active_workers: int
    total_looms: int
    total_sheds: int

    week_dispatch_quantity: int
    week_dispatch_by_company: list[DispatchSummaryRow]
    daily_production: list[dict]


# --------------------------------------------------------------------------
# Register import (photograph of the weekly sheet)
# --------------------------------------------------------------------------
class SheetCell(BaseModel):
    #: None when the loom was idle that day; a blank cell is not a zero.
    value: float | None = None
    #: OCR confidence, 0-1. Only meaningful on an extract response.
    confidence: float = 0.0
    raw: str = ""


class SheetColumn(BaseModel):
    loom_number: str
    cells: list[SheetCell]
    #: The total written under the column on the paper, when one was read.
    written_total: float | None = None
    computed_total: float = 0.0
    #: None when the paper carried no total to check against.
    matches: bool | None = None


class SheetOut(BaseModel):
    """What was read off the photograph. Nothing is saved at this point."""

    columns: list[SheetColumn]
    day_count: int
    grand_total: float
    mismatched_looms: list[str]


class ImportContext(BaseModel):
    """Everything the paper does not record, supplied by the operator."""

    worker_id: int
    shed_id: int
    week_start: date
    shift: Shift
    pick_type: PickType
    rate_per_meter: float = Field(gt=0)
    day_count: int = Field(default=7, ge=1, le=31)


class ImportCommit(ImportContext):
    #: The reviewed grid — what the operator confirmed, not what OCR returned.
    columns: list[SheetColumn]


class ImportedRow(BaseModel):
    entry_date: date
    loom_label: str
    meters: float
    status: str  # created | duplicate | no-such-loom
    detail: str = ""


class ImportResult(BaseModel):
    created: int
    skipped: int
    rows: list[ImportedRow]
