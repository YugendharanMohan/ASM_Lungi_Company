from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_admin
from app.core.labels import loom_label
from app.db.session import get_db
from app.models import Loom, ProductionEntry, Shed
from app.schemas.masters import LoomCreate, LoomOut, LoomUpdate

router = APIRouter(prefix="/looms", tags=["looms"])


def _to_out(loom: Loom, shed_name: str) -> LoomOut:
    return LoomOut(
        id=loom.id,
        loom_number=loom.loom_number,
        shed_id=loom.shed_id,
        is_active=loom.is_active,
        created_at=loom.created_at,
        shed_name=shed_name,
        label=loom_label(shed_name, loom.loom_number),
    )


def _require_shed(db: Session, shed_id: int) -> Shed:
    shed = db.get(Shed, shed_id)
    if shed is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Shed {shed_id} does not exist.",
        )
    return shed


def _assert_number_free(
    db: Session, shed_id: int, number: str, exclude_id: int | None = None
) -> None:
    stmt = select(Loom).where(
        Loom.shed_id == shed_id, func.lower(Loom.loom_number) == number.lower()
    )
    if exclude_id is not None:
        stmt = stmt.where(Loom.id != exclude_id)
    if db.scalar(stmt):
        shed = db.get(Shed, shed_id)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Loom '{number}' already exists in shed "
                f"'{shed.name if shed else shed_id}'."
            ),
        )


@router.get("", response_model=list[LoomOut])
def list_looms(
    shed_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
) -> list[LoomOut]:
    stmt = select(Loom, Shed.name).join(Shed, Loom.shed_id == Shed.id)
    if shed_id is not None:
        stmt = stmt.where(Loom.shed_id == shed_id)
    stmt = stmt.order_by(Shed.name, Loom.loom_number)
    return [_to_out(loom, name) for loom, name in db.execute(stmt).all()]


@router.post("", response_model=LoomOut, status_code=status.HTTP_201_CREATED)
def create_loom(
    payload: LoomCreate,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
) -> LoomOut:
    shed = _require_shed(db, payload.shed_id)
    number = payload.loom_number.strip()
    _assert_number_free(db, payload.shed_id, number)

    loom = Loom(
        loom_number=number, shed_id=payload.shed_id, is_active=payload.is_active
    )
    db.add(loom)
    db.commit()
    db.refresh(loom)
    return _to_out(loom, shed.name)


@router.patch("/{loom_id}", response_model=LoomOut)
def update_loom(
    loom_id: int,
    payload: LoomUpdate,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
) -> LoomOut:
    """Also handles "change shed" — moving a loom is a shed_id update."""
    loom = db.get(Loom, loom_id)
    if loom is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Loom not found.")

    target_shed_id = (
        payload.shed_id if payload.shed_id is not None else loom.shed_id
    )
    target_number = (
        payload.loom_number.strip()
        if payload.loom_number is not None
        else loom.loom_number
    )
    if payload.shed_id is not None:
        _require_shed(db, payload.shed_id)
    _assert_number_free(db, target_shed_id, target_number, exclude_id=loom_id)

    loom.shed_id = target_shed_id
    loom.loom_number = target_number
    if payload.is_active is not None:
        loom.is_active = payload.is_active

    db.commit()
    db.refresh(loom)
    shed = db.get(Shed, loom.shed_id)
    return _to_out(loom, shed.name if shed else "")


@router.delete("/{loom_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_loom(
    loom_id: int, db: Session = Depends(get_db), _=Depends(require_admin)
) -> None:
    loom = db.get(Loom, loom_id)
    if loom is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Loom not found.")

    entries = db.scalar(
        select(func.count(ProductionEntry.id)).where(
            ProductionEntry.loom_id == loom_id
        )
    )
    if entries:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Loom '{loom.loom_number}' has {entries} production "
                "entries. Mark it inactive instead of deleting it, so wage "
                "history stays intact."
            ),
        )

    db.delete(loom)
    db.commit()
