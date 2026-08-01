from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.periods import resolve_period
from app.db.session import get_db
from app.models import ProductionEntry, Shed, Worker
from app.schemas.operations import SalaryReport, SalaryRow

router = APIRouter(prefix="/salary", tags=["salary"])


@router.get("", response_model=SalaryReport)
def salary_report(
    period: str = Query(default="weekly", pattern="^(daily|weekly|monthly)$"),
    reference_date: date | None = Query(default=None),
    worker_id: int | None = Query(default=None),
    shed_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
) -> SalaryReport:
    """Wages for a period, one row per worker.

    Totals come from the entries' stored ``total_amount``, not from
    meters x the worker's *current* rate — a rate change must not rewrite what
    someone was already owed.
    """
    reference = reference_date or date.today()
    try:
        start, end = resolve_period(period, reference)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))

    stmt = (
        select(
            Worker.id,
            Worker.name,
            Worker.phone,
            func.coalesce(Shed.name, "").label("shed_name"),
            func.sum(ProductionEntry.meters).label("total_meters"),
            func.sum(ProductionEntry.total_amount).label("total_amount"),
            func.count(ProductionEntry.id).label("entry_count"),
        )
        .join(ProductionEntry, ProductionEntry.worker_id == Worker.id)
        .outerjoin(Shed, Worker.shed_id == Shed.id)
        .where(
            ProductionEntry.entry_date >= start, ProductionEntry.entry_date <= end
        )
        .group_by(Worker.id, Worker.name, Worker.phone, Shed.name)
        .order_by(func.sum(ProductionEntry.total_amount).desc())
    )
    if worker_id is not None:
        stmt = stmt.where(Worker.id == worker_id)
    if shed_id is not None:
        stmt = stmt.where(Worker.shed_id == shed_id)

    rows = [
        SalaryRow(
            worker_id=r.id,
            worker_name=r.name,
            phone=r.phone or "",
            shed_name=r.shed_name or "",
            total_meters=round(float(r.total_meters or 0), 2),
            total_amount=round(float(r.total_amount or 0), 2),
            entry_count=r.entry_count,
        )
        for r in db.execute(stmt).all()
    ]

    return SalaryReport(
        period=period,
        start_date=start,
        end_date=end,
        rows=rows,
        total_meters=round(sum(r.total_meters for r in rows), 2),
        total_amount=round(sum(r.total_amount for r in rows), 2),
    )
