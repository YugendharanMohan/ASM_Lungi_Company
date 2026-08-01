from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_admin
from app.db.session import get_db
from app.models import Dispatch
from app.schemas.operations import DispatchCreate, DispatchOut, DispatchUpdate

router = APIRouter(prefix="/dispatch", tags=["dispatch"])


@router.get("", response_model=list[DispatchOut])
def list_dispatches(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    company_name: str | None = Query(default=None),
    limit: int = Query(default=500, ge=1, le=2000),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
) -> list[Dispatch]:
    stmt = select(Dispatch)
    if start_date is not None:
        stmt = stmt.where(Dispatch.dispatch_date >= start_date)
    if end_date is not None:
        stmt = stmt.where(Dispatch.dispatch_date <= end_date)
    if company_name:
        stmt = stmt.where(Dispatch.company_name.ilike(f"%{company_name}%"))
    stmt = stmt.order_by(Dispatch.dispatch_date.desc(), Dispatch.id.desc())
    return list(db.scalars(stmt.limit(limit)).all())


@router.post(
    "", response_model=DispatchOut, status_code=status.HTTP_201_CREATED
)
def create_dispatch(
    payload: DispatchCreate,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
) -> Dispatch:
    dispatch = Dispatch(
        company_name=payload.company_name.strip(),
        dispatch_date=payload.dispatch_date,
        quantity=payload.quantity,
        remarks=payload.remarks.strip(),
    )
    db.add(dispatch)
    db.commit()
    db.refresh(dispatch)
    return dispatch


@router.patch("/{dispatch_id}", response_model=DispatchOut)
def update_dispatch(
    dispatch_id: int,
    payload: DispatchUpdate,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
) -> Dispatch:
    dispatch = db.get(Dispatch, dispatch_id)
    if dispatch is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Dispatch not found.")

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(dispatch, key, value.strip() if isinstance(value, str) else value)

    db.commit()
    db.refresh(dispatch)
    return dispatch


@router.delete("/{dispatch_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dispatch(
    dispatch_id: int, db: Session = Depends(get_db), _=Depends(require_admin)
) -> None:
    dispatch = db.get(Dispatch, dispatch_id)
    if dispatch is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Dispatch not found.")
    db.delete(dispatch)
    db.commit()
