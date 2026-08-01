"""Firebase Admin bootstrap and ID token verification.

The app must start and serve without Firebase configured — that is how local
development works before the user creates a project. ``verify_id_token`` raises
if called while unconfigured; callers decide whether that is fatal.
"""

import json
import logging
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


def verify_id_token(token: str) -> dict:
    """Verify a Firebase ID token and return its decoded claims.

    Raises ValueError when Firebase is unconfigured, and firebase_admin's own
    exceptions when the token is invalid, expired or revoked.
    """
    from firebase_admin import auth as fb_auth

    app = _init_app()
    if app is None:
        raise ValueError("Firebase Admin is not configured on this server.")

    # check_revoked forces a lookup so a disabled or signed-out account stops
    # working immediately instead of at token expiry (up to an hour later).
    return fb_auth.verify_id_token(token, app=app, check_revoked=True)
