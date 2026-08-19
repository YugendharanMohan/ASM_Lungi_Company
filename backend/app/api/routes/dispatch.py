from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_admin
from app.db.session import get_db
from app.models import LUNGIS_PER_BUNDLE, Dispatch, DispatchItem
from app.schemas.operations import (
    DispatchCreate,
    DispatchItemIn,
    DispatchItemOut,
    DispatchOut,
    DispatchUpdate,
)

router = APIRouter(prefix="/dispatch", tags=["dispatch"])


def _to_out(dispatch: Dispatch) -> DispatchOut:
    items = [
        DispatchItemOut(
            pick_type=item.pick_type,
            bundles=item.bundles,
            lungis=item.bundles * LUNGIS_PER_BUNDLE,
        )
        for item in dispatch.items
    ]
    return DispatchOut(
        id=dispatch.id,
        company_name=dispatch.company_name,
        dispatch_date=dispatch.dispatch_date,
        remarks=dispatch.remarks,
        created_at=dispatch.created_at,
        items=items,
        total_bundles=sum(item.bundles for item in items),
        quantity=dispatch.quantity,
    )


def _replace_items(dispatch: Dispatch, items: list[DispatchItemIn]) -> None:
    """Reconcile the lines against what was sent, and re-derive the count.

    Rows are matched by pick and updated in place rather than the collection
    being replaced wholesale. Replacing it looks tidier but does not work: the
    old rows are marked for deletion while the new ones are marked for insert,
    and SQLAlchemy emits the INSERTs first within a flush. The new row then
    collides with the old one on uq_dispatch_pick, which has not been deleted
    yet, and every edit that keeps a pick fails with a unique violation.

    Reconciling never inserts a (dispatch_id, pick_type) that is already
    present, so the ordering stops mattering. It also leaves the row ids alone,
    so an edit does not churn the primary keys of lines that did not change.

    The stored ``quantity`` is only ever written here, so it cannot fall out of
    step with the lines it summarises.
    """
    wanted = {item.pick_type: item.bundles for item in items}

    for existing in list(dispatch.items):
        if existing.pick_type in wanted:
            existing.bundles = wanted.pop(existing.pick_type)
        else:
            # Removed from the consignment; delete-orphan takes it from here.
            dispatch.items.remove(existing)

    for pick_type, bundles in wanted.items():
        dispatch.items.append(
            DispatchItem(pick_type=pick_type, bundles=bundles)
        )

    dispatch.quantity = (
        sum(item.bundles for item in items) * LUNGIS_PER_BUNDLE
    )


@router.get("", response_model=list[DispatchOut])
def list_dispatches(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    company_name: str | None = Query(default=None),
    limit: int = Query(default=500, ge=1, le=2000),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
) -> list[DispatchOut]:
    stmt = select(Dispatch)
    if start_date is not None:
        stmt = stmt.where(Dispatch.dispatch_date >= start_date)
    if end_date is not None:
        stmt = stmt.where(Dispatch.dispatch_date <= end_date)
    if company_name:
        stmt = stmt.where(Dispatch.company_name.ilike(f"%{company_name}%"))
    stmt = stmt.order_by(Dispatch.dispatch_date.desc(), Dispatch.id.desc())
    return [_to_out(row) for row in db.scalars(stmt.limit(limit)).all()]


@router.post(
    "", response_model=DispatchOut, status_code=status.HTTP_201_CREATED
)
def create_dispatch(
    payload: DispatchCreate,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
) -> DispatchOut:
    dispatch = Dispatch(
        company_name=payload.company_name.strip(),
        dispatch_date=payload.dispatch_date,
        remarks=payload.remarks.strip(),
    )
    _replace_items(dispatch, payload.items)
    db.add(dispatch)
    db.commit()
    db.refresh(dispatch)
    return _to_out(dispatch)


@router.patch("/{dispatch_id}", response_model=DispatchOut)
def update_dispatch(
    dispatch_id: int,
    payload: DispatchUpdate,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
) -> DispatchOut:
    dispatch = db.get(Dispatch, dispatch_id)
    if dispatch is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Dispatch not found.")

    fields = payload.model_dump(exclude_unset=True)
    items = fields.pop("items", None)

    for key, value in fields.items():
        setattr(dispatch, key, value.strip() if isinstance(value, str) else value)

    if items is not None:
        _replace_items(dispatch, payload.items or [])

    db.commit()
    db.refresh(dispatch)
    return _to_out(dispatch)


@router.delete("/{dispatch_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dispatch(
    dispatch_id: int, db: Session = Depends(get_db), _=Depends(require_admin)
) -> None:
    dispatch = db.get(Dispatch, dispatch_id)
    if dispatch is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Dispatch not found.")
    db.delete(dispatch)
    db.commit()
