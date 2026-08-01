from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_admin
from app.db.session import get_db
from app.models import ProductionEntry, Shed, Worker
from app.schemas.masters import WorkerCreate, WorkerOut, WorkerUpdate

router = APIRouter(prefix="/workers", tags=["workers"])


def _to_out(worker: Worker, shed_name: str) -> WorkerOut:
    return WorkerOut(
        id=worker.id,
        name=worker.name,
        phone=worker.phone,
        shed_id=worker.shed_id,
        rate_per_meter=float(worker.rate_per_meter or 0),
        is_active=worker.is_active,
        created_at=worker.created_at,
        shed_name=shed_name,
    )


def _require_shed(db: Session, shed_id: int | None) -> None:
    if shed_id is not None and db.get(Shed, shed_id) is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"Shed {shed_id} does not exist."
        )


@router.get("", response_model=list[WorkerOut])
def list_workers(
    active_only: bool = Query(default=False),
    shed_id: int | None = Query(default=None),
    search: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
) -> list[WorkerOut]:
    stmt = select(Worker, Shed.name).outerjoin(Shed, Worker.shed_id == Shed.id)
    if active_only:
        stmt = stmt.where(Worker.is_active.is_(True))
    if shed_id is not None:
        stmt = stmt.where(Worker.shed_id == shed_id)
    if search and search.strip():
        # Matched server-side as well as in the table so the search still works
        # once the list outgrows a single page.
        term = f"%{search.strip()}%"
        stmt = stmt.where(or_(Worker.name.ilike(term), Worker.phone.ilike(term)))
    stmt = stmt.order_by(Worker.name)

    return [
        _to_out(worker, shed_name or "")
        for worker, shed_name in db.execute(stmt).all()
    ]


@router.post("", response_model=WorkerOut, status_code=status.HTTP_201_CREATED)
def create_worker(
    payload: WorkerCreate,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
) -> WorkerOut:
    _require_shed(db, payload.shed_id)

    worker = Worker(
        name=payload.name.strip(),
        phone=payload.phone.strip(),
        shed_id=payload.shed_id,
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
    _require_shed(db, fields.get("shed_id", worker.shed_id))

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
    return _to_out(worker, shed.name if shed else "")
