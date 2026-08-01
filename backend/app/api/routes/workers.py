from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_admin
from app.db.session import get_db
from app.models import Loom, ProductionEntry, Shed, Worker
from app.schemas.masters import WorkerCreate, WorkerOut, WorkerUpdate

router = APIRouter(prefix="/workers", tags=["workers"])


def _to_out(worker: Worker, shed_name: str, loom_number: str) -> WorkerOut:
    return WorkerOut(
        id=worker.id,
        name=worker.name,
        phone=worker.phone,
        shed_id=worker.shed_id,
        loom_id=worker.loom_id,
        rate_per_meter=float(worker.rate_per_meter or 0),
        is_active=worker.is_active,
        created_at=worker.created_at,
        shed_name=shed_name,
        loom_number=loom_number,
    )


def _validate_assignment(
    db: Session, shed_id: int | None, loom_id: int | None
) -> None:
    """A worker's loom must actually sit in the worker's shed."""
    if shed_id is not None and db.get(Shed, shed_id) is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"Shed {shed_id} does not exist."
        )
    if loom_id is None:
        return

    loom = db.get(Loom, loom_id)
    if loom is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"Loom {loom_id} does not exist."
        )
    if shed_id is not None and loom.shed_id != shed_id:
        shed = db.get(Shed, loom.shed_id)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Loom '{loom.loom_number}' belongs to shed "
                f"'{shed.name if shed else loom.shed_id}', not the shed you "
                "selected."
            ),
        )


@router.get("", response_model=list[WorkerOut])
def list_workers(
    active_only: bool = Query(default=False),
    shed_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
) -> list[WorkerOut]:
    stmt = (
        select(Worker, Shed.name, Loom.loom_number)
        .outerjoin(Shed, Worker.shed_id == Shed.id)
        .outerjoin(Loom, Worker.loom_id == Loom.id)
    )
    if active_only:
        stmt = stmt.where(Worker.is_active.is_(True))
    if shed_id is not None:
        stmt = stmt.where(Worker.shed_id == shed_id)
    stmt = stmt.order_by(Worker.name)

    return [
        _to_out(w, shed_name or "", loom_number or "")
        for w, shed_name, loom_number in db.execute(stmt).all()
    ]


@router.post("", response_model=WorkerOut, status_code=status.HTTP_201_CREATED)
def create_worker(
    payload: WorkerCreate,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
) -> WorkerOut:
    _validate_assignment(db, payload.shed_id, payload.loom_id)

    worker = Worker(
        name=payload.name.strip(),
        phone=payload.phone.strip(),
        shed_id=payload.shed_id,
        loom_id=payload.loom_id,
        rate_per_meter=payload.rate_per_meter,
        is_active=payload.is_active,
    )
    db.add(worker)
    db.commit()
    db.refresh(worker)
    return _load_out(db, worker)


@router.patch("/{worker_id}", response_model=WorkerOut)
def update_worker(
    worker_id: int,
    payload: WorkerUpdate,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
) -> WorkerOut:
    worker = db.get(Worker, worker_id)
    if worker is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Worker not found.")

    fields = payload.model_dump(exclude_unset=True)
    target_shed = fields.get("shed_id", worker.shed_id)
    target_loom = fields.get("loom_id", worker.loom_id)
    _validate_assignment(db, target_shed, target_loom)

    for key, value in fields.items():
        setattr(worker, key, value.strip() if isinstance(value, str) else value)

    db.commit()
    db.refresh(worker)
    return _load_out(db, worker)


@router.delete("/{worker_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_worker(
    worker_id: int, db: Session = Depends(get_db), _=Depends(require_admin)
) -> None:
    worker = db.get(Worker, worker_id)
    if worker is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Worker not found.")

    entries = db.scalar(
        select(func.count(ProductionEntry.id)).where(
            ProductionEntry.worker_id == worker_id
        )
    )
    if entries:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"{worker.name} has {entries} production entries. Set them "
                "inactive instead of deleting, so past wages stay on record."
            ),
        )

    db.delete(worker)
    db.commit()


def _load_out(db: Session, worker: Worker) -> WorkerOut:
    shed = db.get(Shed, worker.shed_id) if worker.shed_id else None
    loom = db.get(Loom, worker.loom_id) if worker.loom_id else None
    return _to_out(
        worker, shed.name if shed else "", loom.loom_number if loom else ""
    )
