"""Firebase Admin bootstrap and ID token verification.

The app must start and serve without Firebase configured — that is how local
development works before the user creates a project. ``verify_id_token`` raises
if called while unconfigured; callers decide whether that is fatal.
"""

import json
import logging
import time
from functools import lru_cache
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)


@lru_cache
def _init_app() -> Any | None:
    """Initialise the Admin SDK once, or return None if not configured."""
    import firebase_admin
    from firebase_admin import credentials

    if firebase_admin._apps:
        return firebase_admin.get_app()

    cred = None
    if settings.firebase_credentials_json.strip():
        try:
            info = json.loads(settings.firebase_credentials_json)
            cred = credentials.Certificate(info)
        except (json.JSONDecodeError, ValueError) as exc:
            logger.error("FIREBASE_CREDENTIALS_JSON is not valid: %s", exc)
            return None
    elif settings.firebase_credentials_file.strip():
        try:
            cred = credentials.Certificate(settings.firebase_credentials_file)
        except (OSError, ValueError) as exc:
            logger.error("FIREBASE_CREDENTIALS_FILE unusable: %s", exc)
            return None

    if cred is None:
        logger.warning(
            "Firebase Admin is not configured; token verification is disabled."
        )
        return None

    options = {}
    if settings.firebase_project_id:
        options["projectId"] = settings.firebase_project_id
    return firebase_admin.initialize_app(cred, options or None)


def is_configured() -> bool:
    return _init_app() is not None


# uid -> monotonic timestamp of the last revocation check. Process-local, so
# each worker re-checks independently; that is fine, the window is a ceiling
# not a guarantee.
_revocation_checked: dict[str, float] = {}


def verify_id_token(token: str) -> dict:
    """Verify a Firebase ID token and return its decoded claims.

    The signature check is local and costs microseconds. Asking whether the
    token has been *revoked* is a network call to Google — measured at ~600ms,
    and it was the largest single component of every authenticated request.

    So revocation is checked on the first request from a user and then at most
    once per ``AUTH_REVOCATION_CHECK_SECONDS``. The exposure this buys is
    narrow: deactivating an account in this app is enforced from our own
    database on every request and takes effect immediately. Only a revocation
    performed on the Firebase side — a console disable, or a "sign out
    everywhere" — can lag, and by at most that window.

    Raises ValueError when Firebase is unconfigured, and firebase_admin's own
    exceptions when the token is invalid, expired or revoked.
    """
    from firebase_admin import auth as fb_auth

    app = _init_app()
    if app is None:
        raise ValueError("Firebase Admin is not configured on this server.")

    claims = fb_auth.verify_id_token(token, app=app, check_revoked=False)

    window = settings.auth_revocation_check_seconds
    if window <= 0:
        # Opt back into checking every time.
        fb_auth.verify_id_token(token, app=app, check_revoked=True)
        return claims

    uid = claims.get("uid") or claims.get("user_id") or ""
    now = time.monotonic()
    last = _revocation_checked.get(uid)
    if last is None or now - last >= window:
        # Raises if the token has been revoked or the user disabled.
        fb_auth.verify_id_token(token, app=app, check_revoked=True)
        _revocation_checked[uid] = now

    return claims


def forget_revocation_cache(uid: str | None = None) -> None:
    """Force the next request to re-check revocation.

    Called when an admin deactivates or deletes an account, so a Firebase-side
    disable performed at the same moment is not masked by the cache.
    """
    if uid is None:
        _revocation_checked.clear()
    else:
        _revocation_checked.pop(uid, None)
