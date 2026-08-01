from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.labels import loom_label
from app.db.session import get_db
from app.models import Loom, PickType, ProductionEntry, Shed, Shift, Worker
from app.schemas.operations import (
    ProductionCreate,
    ProductionOut,
    ProductionUpdate,
)

router = APIRouter(prefix="/production", tags=["production"])

DUPLICATE_MESSAGE = (
    "An entry already exists for this worker, loom, date and shift. "
    "Edit that entry instead of adding a second one."
)


def _round2(value: float) -> float:
    return round(float(value or 0) + 0.0, 2)


def _to_out(
    entry: ProductionEntry,
    worker_name: str = "",
    loom_number: str = "",
    shed_name: str = "",
) -> ProductionOut:
    return ProductionOut(
        id=entry.id,
        entry_date=entry.entry_date,
        shift=entry.shift,
        pick_type=entry.pick_type,
        worker_id=entry.worker_id,
        loom_id=entry.loom_id,
        meters=float(entry.meters or 0),
        rate_per_meter=float(entry.rate_per_meter or 0),
        total_amount=float(entry.total_amount or 0),
        created_at=entry.created_at,
        worker_name=worker_name,
        loom_number=loom_number,
        shed_name=shed_name,
        loom_label=loom_label(shed_name, loom_number),
    )


def _base_query():
    return (
        select(ProductionEntry, Worker.name, Loom.loom_number, Shed.name)
        .join(Worker, ProductionEntry.worker_id == Worker.id)
        .join(Loom, ProductionEntry.loom_id == Loom.id)
        .outerjoin(Shed, Loom.shed_id == Shed.id)
    )


def _load_out(db: Session, entry_id: int) -> ProductionOut:
    row = db.execute(
        _base_query().where(ProductionEntry.id == entry_id)
    ).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found.")
    entry, worker_name, loom_number, shed_name = row
    return _to_out(entry, worker_name, loom_number, shed_name or "")


def _validate_refs(db: Session, worker_id: int, loom_id: int) -> None:
    if db.get(Worker, worker_id) is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"Worker {worker_id} does not exist."
        )
    if db.get(Loom, loom_id) is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"Loom {loom_id} does not exist."
        )


@router.get("", response_model=list[ProductionOut])
def list_production(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    worker_id: int | None = Query(default=None),
    loom_id: int | None = Query(default=None),
    shed_id: int | None = Query(default=None),
    shift: Shift | None = Query(default=None),
    pick_type: PickType | None = Query(default=None),
    limit: int = Query(default=500, ge=1, le=2000),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
) -> list[ProductionOut]:
    stmt = _base_query()
    if start_date is not None:
        stmt = stmt.where(ProductionEntry.entry_date >= start_date)
    if end_date is not None:
        stmt = stmt.where(ProductionEntry.entry_date <= end_date)
    if worker_id is not None:
        stmt = stmt.where(ProductionEntry.worker_id == worker_id)
    if loom_id is not None:
        stmt = stmt.where(ProductionEntry.loom_id == loom_id)
    if shed_id is not None:
        stmt = stmt.where(Loom.shed_id == shed_id)
    if shift is not None:
        stmt = stmt.where(ProductionEntry.shift == shift)
    if pick_type is not None:
        stmt = stmt.where(ProductionEntry.pick_type == pick_type)

    stmt = stmt.order_by(
        ProductionEntry.entry_date.desc(), ProductionEntry.id.desc()
    ).limit(limit)

    return [
        _to_out(entry, worker_name, loom_number, shed_name or "")
        for entry, worker_name, loom_number, shed_name in db.execute(stmt).all()
    ]


@router.post(
    "", response_model=ProductionOut, status_code=status.HTTP_201_CREATED
)
def create_production(
    payload: ProductionCreate,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
) -> ProductionOut:
    _validate_refs(db, payload.worker_id, payload.loom_id)

    if payload.entry_date > date.today():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Production cannot be recorded for a future date.",
        )

    entry = ProductionEntry(
        entry_date=payload.entry_date,
        shift=payload.shift,
        pick_type=payload.pick_type,
        worker_id=payload.worker_id,
        loom_id=payload.loom_id,
        meters=_round2(payload.meters),
        rate_per_meter=_round2(payload.rate_per_meter),
        total_amount=_round2(payload.meters * payload.rate_per_meter),
    )
    db.add(entry)
    try:
        db.commit()
    except IntegrityError:
        # The unique constraint is the real guard; this converts it into a
        # message the operator can act on.
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, DUPLICATE_MESSAGE)

    db.refresh(entry)
    return _load_out(db, entry.id)


@router.patch("/{entry_id}", response_model=ProductionOut)
def update_production(
    entry_id: int,
    payload: ProductionUpdate,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
) -> ProductionOut:
    entry = db.get(ProductionEntry, entry_id)
    if entry is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found.")

    fields = payload.model_dump(exclude_unset=True)
    _validate_refs(
        db,
        fields.get("worker_id", entry.worker_id),
        fields.get("loom_id", entry.loom_id),
    )

    for key, value in fields.items():
        setattr(entry, key, value)

    entry.meters = _round2(entry.meters)
    entry.rate_per_meter = _round2(entry.rate_per_meter)
    entry.total_amount = _round2(
        float(entry.meters) * float(entry.rate_per_meter)
    )

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, DUPLICATE_MESSAGE)

    return _load_out(db, entry_id)


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_production(
    entry_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)
) -> None:
    entry = db.get(ProductionEntry, entry_id)
    if entry is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found.")
    db.delete(entry)
    db.commit()
