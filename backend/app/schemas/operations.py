from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.production import Shift


# --------------------------------------------------------------------------
# Production
# --------------------------------------------------------------------------
class ProductionBase(BaseModel):
    entry_date: date
    shift: Shift = Shift.DAY
    worker_id: int
    loom_id: int
    meters: float = Field(ge=0)
    rate_per_meter: float = Field(ge=0)


class ProductionCreate(ProductionBase):
    pass


class ProductionUpdate(BaseModel):
    entry_date: date | None = None
    shift: Shift | None = None
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


# --------------------------------------------------------------------------
# Dispatch
# --------------------------------------------------------------------------
class DispatchBase(BaseModel):
    company_name: str = Field(min_length=1, max_length=160)
    dispatch_date: date
    quantity: int = Field(ge=0)
    remarks: str = ""


class DispatchCreate(DispatchBase):
    pass


class DispatchUpdate(BaseModel):
    company_name: str | None = Field(default=None, min_length=1, max_length=160)
    dispatch_date: date | None = None
    quantity: int | None = Field(default=None, ge=0)
    remarks: str | None = None


class DispatchOut(DispatchBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime


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
