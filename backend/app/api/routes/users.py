from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core import firebase
from app.core.deps import get_current_user, require_admin
from app.db.session import get_db
from app.models import User, UserRole
from app.schemas.user import UserCreate, UserOut, UserUpdate

router = APIRouter(tags=["users"])


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    """Who the caller is, and what they are allowed to do.

    The frontend calls this right after Firebase sign-in; a 401/403 here is
    what tells it the account is unverified, unknown or deactivated.
    """
    return user


@router.get("/users", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db), _=Depends(require_admin)
) -> list[User]:
    return list(db.scalars(select(User).order_by(User.email)).all())


@router.post(
    "/users", response_model=UserOut, status_code=status.HTTP_201_CREATED
)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
) -> User:
    """Grant an email address access. Admin only — there is no public signup.

    This authorises the address; the person still has to exist as a Firebase
    account and verify their email before any request of theirs is accepted.
    """
    email = payload.email.strip().lower()
    if db.scalar(select(User).where(func.lower(User.email) == email)):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{email} already has access.",
        )

    user = User(
        email=email,
        display_name=payload.display_name.strip(),
        role=payload.role,
        is_active=payload.is_active,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found.")

    fields = payload.model_dump(exclude_unset=True)

    # Guard against an admin locking everyone out of admin functions: the last
    # active admin may not demote or deactivate themselves.
    losing_admin = (
        fields.get("role") is not None and fields["role"] != UserRole.ADMIN
    ) or fields.get("is_active") is False
    if user.role == UserRole.ADMIN and losing_admin:
        remaining = db.scalar(
            select(func.count(User.id)).where(
                User.role == UserRole.ADMIN,
                User.is_active.is_(True),
                User.id != user_id,
            )
        )
        if not remaining:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "This is the only active administrator. Promote someone "
                    "else before changing this account."
                ),
            )

    for key, value in fields.items():
        setattr(user, key, value.strip() if isinstance(value, str) else value)

    db.commit()
    db.refresh(user)
    # Deactivating here is enforced from our own table on the next request, so
    # it bites immediately. Dropping the cached revocation timestamp as well
    # means a simultaneous disable on the Firebase side is not masked by it.
    firebase.forget_revocation_cache(user.firebase_uid)
    return user


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> None:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found.")
    if user.id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You cannot remove your own account.",
        )

    uid = user.firebase_uid
    db.delete(user)
    db.commit()
    firebase.forget_revocation_cache(uid)
