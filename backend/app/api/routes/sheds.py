from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_admin
from app.db.session import get_db
from app.models import Loom, Shed
from app.schemas.masters import ShedCreate, ShedOut, ShedUpdate

router = APIRouter(prefix="/sheds", tags=["sheds"])


def _to_out(shed: Shed, loom_count: int) -> ShedOut:
    return ShedOut(
        id=shed.id,
        name=shed.name,
        location=shed.location,
        created_at=shed.created_at,
        loom_count=loom_count,
    )


@router.get("", response_model=list[ShedOut])
def list_sheds(
    db: Session = Depends(get_db), _=Depends(get_current_user)
) -> list[ShedOut]:
    # Counted in one grouped query rather than len(shed.looms) per row, which
    # would fire a query per shed.
    counts = dict(
        db.execute(
            select(Loom.shed_id, func.count(Loom.id)).group_by(Loom.shed_id)
        ).all()
    )
    sheds = db.scalars(select(Shed).order_by(Shed.name)).all()
    return [_to_out(s, counts.get(s.id, 0)) for s in sheds]


@router.post("", response_model=ShedOut, status_code=status.HTTP_201_CREATED)
def create_shed(
    payload: ShedCreate,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
) -> ShedOut:
    name = payload.name.strip()
    if db.scalar(select(Shed).where(func.lower(Shed.name) == name.lower())):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A shed named '{name}' already exists.",
        )
    shed = Shed(name=name, location=payload.location.strip())
    db.add(shed)
    db.commit()
    db.refresh(shed)
    return _to_out(shed, 0)


@router.patch("/{shed_id}", response_model=ShedOut)
def update_shed(
    shed_id: int,
    payload: ShedUpdate,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
) -> ShedOut:
    shed = db.get(Shed, shed_id)
    if shed is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Shed not found.")

    if payload.name is not None:
        name = payload.name.strip()
        clash = db.scalar(
            select(Shed).where(
                func.lower(Shed.name) == name.lower(), Shed.id != shed_id
            )
        )
        if clash:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"A shed named '{name}' already exists.",
            )
        shed.name = name
    if payload.location is not None:
        shed.location = payload.location.strip()

    db.commit()
    db.refresh(shed)
    count = db.scalar(
        select(func.count(Loom.id)).where(Loom.shed_id == shed_id)
    )
    return _to_out(shed, count or 0)


@router.delete("/{shed_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_shed(
    shed_id: int, db: Session = Depends(get_db), _=Depends(require_admin)
) -> None:
    shed = db.get(Shed, shed_id)
    if shed is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Shed not found.")

    # Deleting a shed cascades to its looms, and looms cascade to production
    # entries — that would erase wage history. Refuse and let the user move the
    # looms first.
    loom_count = db.scalar(
        select(func.count(Loom.id)).where(Loom.shed_id == shed_id)
    )
    if loom_count:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"'{shed.name}' still has {loom_count} loom(s). Move or delete "
                "them before deleting the shed."
            ),
        )

    db.delete(shed)
    db.commit()
