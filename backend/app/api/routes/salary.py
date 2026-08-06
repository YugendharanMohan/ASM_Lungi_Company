from collections import defaultdict
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.labels import loom_label, loom_label_sort_key
from app.core.periods import resolve_period
from app.core.receipt_pdf import render_receipt_pdf
from app.db.session import get_db
from app.models import Loom, ProductionEntry, Shed, Worker
from app.schemas.operations import (
    RateGroup,
    ReceiptCell,
    ReceiptRow,
    SalaryReceipt,
    SalaryReport,
    SalaryRow,
)

router = APIRouter(prefix="/salary", tags=["salary"])


def _bounds(
    period: str, reference: date | None, start: date | None, end: date | None
) -> tuple[str, date, date]:
    """Resolve the reporting window.

    An explicit start/end always wins — that is the operator naming the period
    directly, and it must not be quietly snapped to a week or month boundary.
    """
    if start is not None or end is not None:
        if start is None or end is None:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Give both start_date and end_date, or neither.",
            )
        if start > end:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "The start date must not be after the end date.",
            )
        return "custom", start, end

    try:
        resolved_start, resolved_end = resolve_period(
            period, reference or date.today()
        )
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))
    return period, resolved_start, resolved_end


@router.get("", response_model=SalaryReport)
def salary_report(
    period: str = Query(default="weekly", pattern="^(daily|weekly|monthly)$"),
    reference_date: date | None = Query(default=None),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
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
    label, start, end = _bounds(period, reference_date, start_date, end_date)

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
        period=label,
        start_date=start,
        end_date=end,
        rows=rows,
        total_meters=round(sum(r.total_meters for r in rows), 2),
        total_amount=round(sum(r.total_amount for r in rows), 2),
    )


def _build_receipt(
    db: Session, worker_id: int, start: date, end: date
) -> SalaryReceipt:
    worker = db.get(Worker, worker_id)
    if worker is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Worker not found.")

    records = db.execute(
        select(
            ProductionEntry.entry_date,
            ProductionEntry.meters,
            ProductionEntry.rate_per_meter,
            ProductionEntry.pick_type,
            Loom.loom_number,
            Shed.name,
        )
        .join(Loom, ProductionEntry.loom_id == Loom.id)
        .outerjoin(Shed, Loom.shed_id == Shed.id)
        .where(
            ProductionEntry.worker_id == worker_id,
            ProductionEntry.entry_date >= start,
            ProductionEntry.entry_date <= end,
        )
        .order_by(ProductionEntry.entry_date)
    ).all()

    # date -> loom label -> metres. A worker can touch the same loom twice in a
    # day (two shifts), and the receipt shows one figure per loom per day, so
    # the shifts are summed rather than one overwriting the other.
    by_date: dict[date, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    labels: set[str] = set()
    # Grouped by rate, as wages are checked: "220 metres at 9, 340 at 10".
    by_rate: dict[float, dict[str, float | set]] = defaultdict(
        lambda: {"meters": 0.0, "amount": 0.0, "picks": set()}
    )

    for entry_date, meters, rate, pick_type, loom_number, shed_name in records:
        label = loom_label(shed_name, loom_number)
        labels.add(label)
        by_date[entry_date][label] += float(meters or 0)

        rate_value = round(float(rate or 0), 2)
        bucket = by_rate[rate_value]
        bucket["meters"] += float(meters or 0)
        bucket["amount"] += float(meters or 0) * rate_value
        bucket["picks"].add(pick_type.value)

    loom_labels = sorted(labels, key=loom_label_sort_key)

    rows = [
        ReceiptRow(
            entry_date=day,
            cells=[
                ReceiptCell(
                    loom_label=label,
                    meters=(
                        round(by_date[day][label], 2)
                        if label in by_date[day]
                        else None
                    ),
                )
                for label in loom_labels
            ],
            total=round(sum(by_date[day].values()), 2),
        )
        for day in sorted(by_date)
    ]

    loom_totals = [
        ReceiptCell(
            loom_label=label,
            meters=round(
                sum(day_values.get(label, 0.0) for day_values in by_date.values()), 2
            ),
        )
        for label in loom_labels
    ]

    rate_groups = [
        RateGroup(
            rate=rate,
            pick_types=sorted(bucket["picks"]),
            meters=round(float(bucket["meters"]), 2),
            amount=round(float(bucket["amount"]), 2),
        )
        for rate, bucket in sorted(by_rate.items())
    ]

    total_meters = round(sum(group.meters for group in rate_groups), 2)
    total_amount = round(sum(group.amount for group in rate_groups), 2)

    return SalaryReceipt(
        worker_id=worker.id,
        worker_name=worker.name,
        phone=worker.phone or "",
        start_date=start,
        end_date=end,
        loom_labels=loom_labels,
        rows=rows,
        loom_totals=loom_totals,
        rate_groups=rate_groups,
        total_meters=total_meters,
        total_amount=total_amount,
        # Reported, never used to compute pay: the money is the sum of the rate
        # groups. A blended average would disagree with the lines above it.
        average_rate=round(total_amount / total_meters, 2) if total_meters else 0.0,
    )


@router.get("/receipt/{worker_id}", response_model=SalaryReceipt)
def salary_receipt(
    worker_id: int,
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
) -> SalaryReceipt:
    if start_date > end_date:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "The start date must not be after the end date.",
        )
    return _build_receipt(db, worker_id, start_date, end_date)


@router.get("/receipt/{worker_id}/pdf")
def salary_receipt_pdf(
    worker_id: int,
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
) -> Response:
    if start_date > end_date:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "The start date must not be after the end date.",
        )
    receipt = _build_receipt(db, worker_id, start_date, end_date)
    pdf = render_receipt_pdf(receipt)

    safe_name = "".join(
        ch if ch.isalnum() or ch in "-_" else "-" for ch in receipt.worker_name
    ).strip("-")
    filename = f"salary-{safe_name or receipt.worker_id}-{start_date}-to-{end_date}.pdf"

    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
