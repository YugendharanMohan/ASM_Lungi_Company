from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.periods import week_bounds
from app.db.session import get_db
from app.models import Dispatch, Loom, ProductionEntry, Shed, Worker
from app.schemas.operations import DashboardStats, DispatchSummaryRow

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardStats)
def dashboard(
    reference_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
) -> DashboardStats:
    today = reference_date or date.today()
    week_start, week_end = week_bounds(today)

    def production_totals(start: date, end: date) -> tuple[float, float]:
        row = db.execute(
            select(
                func.coalesce(func.sum(ProductionEntry.meters), 0),
                func.coalesce(func.sum(ProductionEntry.total_amount), 0),
            ).where(
                ProductionEntry.entry_date >= start,
                ProductionEntry.entry_date <= end,
            )
        ).first()
        return round(float(row[0]), 2), round(float(row[1]), 2)

    today_meters, today_amount = production_totals(today, today)
    week_meters, week_amount = production_totals(week_start, week_end)

    total_workers = db.scalar(select(func.count(Worker.id))) or 0
    active_workers = (
        db.scalar(
            select(func.count(Worker.id)).where(Worker.is_active.is_(True))
        )
        or 0
    )
    total_looms = db.scalar(select(func.count(Loom.id))) or 0
    total_sheds = db.scalar(select(func.count(Shed.id))) or 0

    week_dispatch_quantity = (
        db.scalar(
            select(func.coalesce(func.sum(Dispatch.quantity), 0)).where(
                Dispatch.dispatch_date >= week_start,
                Dispatch.dispatch_date <= week_end,
            )
        )
        or 0
    )
    dispatch_rows = db.execute(
        select(Dispatch.company_name, func.sum(Dispatch.quantity))
        .where(
            Dispatch.dispatch_date >= week_start,
            Dispatch.dispatch_date <= week_end,
        )
        .group_by(Dispatch.company_name)
        .order_by(func.sum(Dispatch.quantity).desc())
    ).all()

    # Seven-day trend for the dashboard chart. Days with no production still
    # need a point, or the chart silently compresses the gaps and misleads.
    totals_by_day = dict(
        db.execute(
            select(
                ProductionEntry.entry_date,
                func.coalesce(func.sum(ProductionEntry.meters), 0),
            )
            .where(
                ProductionEntry.entry_date >= today - timedelta(days=6),
                ProductionEntry.entry_date <= today,
            )
            .group_by(ProductionEntry.entry_date)
        ).all()
    )
    daily_production = [
        {
            "date": (day := today - timedelta(days=offset)).isoformat(),
            "meters": round(float(totals_by_day.get(day, 0)), 2),
        }
        for offset in range(6, -1, -1)
    ]

    return DashboardStats(
        today=today,
        week_start=week_start,
        week_end=week_end,
        today_meters=today_meters,
        today_amount=today_amount,
        week_meters=week_meters,
        week_amount=week_amount,
        total_workers=total_workers,
        active_workers=active_workers,
        total_looms=total_looms,
        total_sheds=total_sheds,
        week_dispatch_quantity=int(week_dispatch_quantity),
        week_dispatch_by_company=[
            DispatchSummaryRow(company_name=name, quantity=int(qty or 0))
            for name, qty in dispatch_rows
        ],
        daily_production=daily_production,
    )
