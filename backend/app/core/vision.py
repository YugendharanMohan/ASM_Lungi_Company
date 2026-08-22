"""Read a photographed register through Google Cloud Vision.

Only the OCR call lives here. Turning the words into the sheet's grid is
:mod:`app.core.sheet_grid`, which is deliberately free of any Google
dependency so it can be tested without a network call or a billing account.
"""

from __future__ import annotations

import json
import logging
from functools import lru_cache
from typing import Any

from app.core.config import settings
from app.core.sheet_grid import Word

logger = logging.getLogger(__name__)


class VisionUnavailable(RuntimeError):
    """Raised when the OCR service cannot be used, with a fixable message."""


@lru_cache
def _client() -> Any | None:
    """Build the Vision client from the Firebase service account.

    Cloud Vision lives on the same Google Cloud project as Firebase, so the
    credentials already deployed for token verification work unchanged — there
    is no second secret to manage or rotate.
    """
    from google.cloud import vision
    from google.oauth2 import service_account

    info: dict | None = None
    if settings.firebase_credentials_json.strip():
        info = json.loads(settings.firebase_credentials_json)
    elif settings.firebase_credentials_file.strip():
        with open(settings.firebase_credentials_file) as handle:
            info = json.load(handle)

    if info is None:
        return None

    creds = service_account.Credentials.from_service_account_info(
        info, scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )
    # REST rather than the default gRPC. gRPC resolves vision.googleapis.com
    # over its own DNS path, which fails in sandboxed and some container
    # networks with an opaque "could not contact DNS servers"; REST rides on
    # ordinary HTTPS, which works anywhere the rest of the app already reaches.
    return vision.ImageAnnotatorClient(credentials=creds, transport="rest")


def is_configured() -> bool:
    try:
        return _client() is not None
    except Exception:  # noqa: BLE001 - report as unavailable, never crash boot
        return False


def read_words(image: bytes) -> list[Word]:
    """OCR an image into positioned words.

    Uses DOCUMENT_TEXT_DETECTION, which is tuned for dense handwritten pages;
    the plain TEXT_DETECTION model is built for signage and short labels and
    reads a ruled register noticeably worse.
    """
    from google.cloud import vision as gv

    client = _client()
    if client is None:
        raise VisionUnavailable(
            "Reading photographs is not configured on this server: no Google "
            "credentials were found."
        )

    try:
        response = client.document_text_detection(image=gv.Image(content=image))
    except Exception as exc:  # noqa: BLE001 - many Google error types
        raise VisionUnavailable(_explain(str(exc))) from exc

    if response.error.message:
        raise VisionUnavailable(_explain(response.error.message))

    words: list[Word] = []
    for page in response.full_text_annotation.pages:
        for block in page.blocks:
            for paragraph in block.paragraphs:
                for word in paragraph.words:
                    text = "".join(s.text for s in word.symbols)
                    xs = [v.x for v in word.bounding_box.vertices]
                    ys = [v.y for v in word.bounding_box.vertices]
                    if not xs or not ys:
                        continue
                    words.append(
                        Word(
                            text=text,
                            x=sum(xs) / len(xs),
                            y=sum(ys) / len(ys),
                            confidence=word.confidence or 0.0,
                        )
                    )
    return words


def _explain(message: str) -> str:
    """Turn Google's errors into something with a next step in it."""
    lowered = message.lower()
    if "billing" in lowered:
        return (
            "Google Cloud billing is not enabled on this project. Cloud Vision "
            "needs a billing account attached even to use its free monthly "
            "allowance. Enable billing in the Google Cloud console, then retry."
        )
    if "has not been used" in lowered or "disabled" in lowered:
        return (
            "The Cloud Vision API is not enabled on this Google Cloud project. "
            "Enable it in the console, wait a minute, then retry."
        )
    if "permission" in lowered or "forbidden" in lowered:
        return (
            "The service account is not allowed to call Cloud Vision. Grant it "
            "the Cloud Vision AI User role."
        )
    logger.warning("Vision call failed: %s", message[:400])
    return "Could not read the photograph. Please try again."
