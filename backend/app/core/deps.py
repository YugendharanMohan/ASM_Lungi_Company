"""Request authentication and authorisation.

Three gates, in order, all server-side. The frontend enforces the same rules
for user experience, but a client check is not a control — everything that
matters is decided here.

  1. The bearer token is a valid, unrevoked Firebase ID token.
  2. The token's ``email_verified`` claim is true.
  3. The email has a row in ``users`` and that row is active.

Gate 3 is what makes registration admin-only: anyone can create a Firebase
account if they somehow reach the project, but without a row here they get 403
and can read nothing.
"""

import logging
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core import firebase
from app.core.config import settings
from app.db.session import get_db
from app.models.user import User, UserRole

logger = logging.getLogger(__name__)

# auto_error=False so a missing header produces our own 401 with a useful
# message rather than FastAPI's bare "Not authenticated".
bearer_scheme = HTTPBearer(auto_error=False)

# Needs a dot in the domain: UserOut.email is an EmailStr, so an address that
# fails validation turns every /api/me response into a 500.
DEV_BYPASS_EMAIL = "dev-admin@asm.local"


def _unauthorised(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def _get_or_create_bypass_user(db: Session) -> User:
    user = db.scalar(select(User).where(User.email == DEV_BYPASS_EMAIL))
    if user is None:
        user = User(
            email=DEV_BYPASS_EMAIL,
            display_name="Dev Admin",
            role=UserRole.ADMIN,
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if settings.auth_dev_bypass:
        logger.warning(
            "AUTH_DEV_BYPASS is on — %s %s served without authentication.",
            request.method,
            request.url.path,
        )
        return _get_or_create_bypass_user(db)

    if credentials is None or not credentials.credentials:
        raise _unauthorised("Missing bearer token.")

    if not firebase.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Authentication is not configured on the server. Set "
                "FIREBASE_CREDENTIALS_JSON or FIREBASE_CREDENTIALS_FILE."
            ),
        )

    try:
        claims = firebase.verify_id_token(credentials.credentials)
    except Exception as exc:  # noqa: BLE001 - firebase_admin raises many types
        logger.info("Token rejected: %s", exc)
        raise _unauthorised("Invalid or expired session. Please sign in again.")

    # Gate 2: email verification is mandatory and non-negotiable.
    if not claims.get("email_verified", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Your email address is not verified. Check your inbox for the "
                "verification link, then sign in again."
            ),
        )

    email = (claims.get("email") or "").strip().lower()
    if not email:
        raise _unauthorised("Token carries no email address.")

    # Gate 3: the account must have been provisioned by an admin. Compared
    # case-insensitively because Firebase preserves whatever case the user
    # typed, while admins tend to enter addresses lowercase.
    user = db.scalar(select(User).where(func.lower(User.email) == email))

    if user is None and email in settings.bootstrap_admin_list:
        # First-run bootstrap: with no users at all, nobody could create the
        # first one. BOOTSTRAP_ADMIN_EMAILS names the accounts allowed to
        # self-provision as admin.
        user = User(
            email=email,
            display_name=claims.get("name", "") or "",
            role=UserRole.ADMIN,
            is_active=True,
        )
        db.add(user)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "This account has not been granted access. Ask an "
                "administrator to add you."
            ),
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated.",
        )

    # Bind the Firebase uid on first sight so the account is traceable even if
    # the email is later changed in the console.
    uid = claims.get("uid") or claims.get("user_id")
    now = datetime.now(timezone.utc)

    dirty = False
    if uid and user.firebase_uid != uid:
        user.firebase_uid = uid
        dirty = True

    # last_login_at is a "last seen" marker, so it is only rewritten once it
    # has gone stale. Updating it on every request cost an UPDATE and a COMMIT
    # round-trip to the database each time — around 220ms against a hosted
    # Postgres, spent on a field nobody reads to the second.
    last = user.last_login_at
    if last is not None and last.tzinfo is None:
        # SQLite hands back naive datetimes; compare like with like.
        last = last.replace(tzinfo=timezone.utc)
    if (
        last is None
        or (now - last).total_seconds() >= settings.last_seen_refresh_seconds
    ):
        user.last_login_at = now
        dirty = True

    if dirty:
        db.commit()
    else:
        # Nothing to persist. Release the transaction the SELECT opened rather
        # than leaving it idle for the rest of the request.
        db.rollback()

    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This action requires an administrator account.",
        )
    return user
