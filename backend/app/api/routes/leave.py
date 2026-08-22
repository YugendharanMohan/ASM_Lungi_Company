"""Days a worker did not work.

Kept as its own resource rather than a flag on production entries: an absence
is the absence OF entries, so there is no row to hang it on.
"""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models import ProductionEntry, Worker, WorkerLeave
from app.schemas.leave import LeaveCreate, LeaveOut

router = APIRouter(prefix="/leave", tags=["leave"])


@router.get("", response_model=list[LeaveOut])
def list_leave(
    worker_id: int | None = Query(default=None),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
) -> list[LeaveOut]:
    stmt = select(WorkerLeave, Worker.name).join(Worker, WorkerLeave.worker_id == Worker.id)
    if worker_id is not None:
        stmt = stmt.where(WorkerLeave.worker_id == worker_id)
    if start_date is not None:
        stmt = stmt.where(WorkerLeave.leave_date >= start_date)
    if end_date is not None:
        stmt = stmt.where(WorkerLeave.leave_date <= end_date)
    stmt = stmt.order_by(WorkerLeave.leave_date.desc())

    return [
        LeaveOut(
            id=row.id,
            worker_id=row.worker_id,
            leave_date=row.leave_date,
            note=row.note,
            created_at=row.created_at,
            worker_name=name,
        )
        for row, name in db.execute(stmt).all()
    ]


@router.post("", response_model=LeaveOut, status_code=status.HTTP_201_CREATED)
def mark_leave(
    payload: LeaveCreate,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
) -> LeaveOut:
    worker = db.get(Worker, payload.worker_id)
    if worker is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Worker not found.")

    # Refuse rather than silently contradict the record: metres already booked
    # say the worker was at the loom, so one of the two claims is wrong and a
    # person should decide which.
    existing = db.scalar(
        select(ProductionEntry.id).where(
            ProductionEntry.worker_id == payload.worker_id,
            ProductionEntry.entry_date == payload.leave_date,
        )
    )
    if existing is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{worker.name} already has production recorded on "
            f"{payload.leave_date:%d %b %Y}. Delete those entries first if the "
            "day really was leave.",
        )

    entry = WorkerLeave(
        worker_id=payload.worker_id,
        leave_date=payload.leave_date,
        note=payload.note.strip(),
    )
    db.add(entry)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{worker.name} is already marked on leave that day.",
        )
    db.refresh(entry)
    return LeaveOut(
        id=entry.id,
        worker_id=entry.worker_id,
        leave_date=entry.leave_date,
        note=entry.note,
        created_at=entry.created_at,
        worker_name=worker.name,
    )


@router.delete("/{leave_id}", status_code=status.HTTP_204_NO_CONTENT)
def unmark_leave(
    leave_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
) -> None:
    entry = db.get(WorkerLeave, leave_id)
    if entry is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Leave record not found.")
    db.delete(entry)
    db.commit()
