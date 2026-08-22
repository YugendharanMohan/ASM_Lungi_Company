"""Read a photographed weekly register and turn it into production entries.

Two endpoints, deliberately separate:

``extract`` reads the photograph and returns the grid without touching the
database. ``commit`` writes the grid the operator confirmed. Splitting them is
what makes the review step real — there is no code path from a photograph to a
wage record that does not pass through a human.
"""

from datetime import timedelta

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.labels import loom_label
from app.core.sheet_grid import build_sheet
from app.core.vision import VisionUnavailable, is_configured, read_words
from app.db.session import get_db
from app.models import Loom, ProductionEntry, Shed, Worker
from app.schemas.operations import (
    ImportCommit,
    ImportedRow,
    ImportResult,
    SheetCell,
    SheetColumn,
    SheetOut,
)

router = APIRouter(prefix="/production/import", tags=["production"])

# A phone photo of a diary page is a few megabytes; anything far past that is a
# mistake or an attempt to tie up the server, and Vision rejects it anyway.
MAX_IMAGE_BYTES = 12 * 1024 * 1024


@router.post("/extract", response_model=SheetOut)
async def extract_sheet(
    image: UploadFile = File(...),
    day_count: int = Form(default=7),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
) -> SheetOut:
    if not is_configured():
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Reading photographs is not configured on this server.",
        )
    if not (1 <= day_count <= 31):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "day_count must be 1-31.")

    content = await image.read()
    if not content:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The file was empty.")
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            "That image is too large. Photograph the page again, or reduce it "
            "below 12 MB.",
        )

    try:
        words = read_words(content)
    except VisionUnavailable as exc:
        # The message already says what to do about it.
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc))

    sheet = build_sheet(words, day_count=day_count)
    if not sheet.columns:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "No loom columns could be found on that photograph. Take it square "
            "to the page, with the row of loom numbers and every column of "
            "figures inside the frame.",
        )

    return SheetOut(
        columns=[
            SheetColumn(
                loom_number=column.loom_number,
                cells=[
                    SheetCell(
                        value=cell.value,
                        confidence=cell.confidence,
                        raw=cell.raw,
                    )
                    for cell in column.cells
                ],
                written_total=column.written_total,
                computed_total=column.computed_total,
                matches=column.matches,
            )
            for column in sheet.columns
        ],
        day_count=sheet.day_count,
        grand_total=sheet.grand_total,
        mismatched_looms=sheet.mismatched_looms,
    )


@router.post("/commit", response_model=ImportResult)
def commit_sheet(
    payload: ImportCommit,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
) -> ImportResult:
    worker = db.get(Worker, payload.worker_id)
    if worker is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Worker not found.")
    shed = db.get(Shed, payload.shed_id)
    if shed is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Shed not found.")

    # Resolve every loom on the sheet up front, so a wrong shed fails as one
    # clear message rather than as fifty identical row errors.
    looms = {
        loom.loom_number: loom
        for loom in db.scalars(
            select(Loom).where(Loom.shed_id == payload.shed_id)
        ).all()
    }

    rows: list[ImportedRow] = []
    created = 0

    for column in payload.columns:
        loom = looms.get(column.loom_number)
        label = loom_label(shed.name, column.loom_number)

        # The loom's own pick and rate win; the sheet-level ones are only a
        # fallback for columns the operator left alone.
        pick_type = column.pick_type or payload.pick_type
        rate = column.rate_per_meter or payload.rate_per_meter

        for day_index, cell in enumerate(column.cells):
            # A blank cell means the loom stood idle; there is nothing to
            # record, and a zero-metre entry would be a claim that it ran.
            if cell.value is None or cell.value <= 0:
                continue

            entry_date = payload.week_start + timedelta(days=day_index)

            if loom is None:
                rows.append(
                    ImportedRow(
                        entry_date=entry_date,
                        loom_label=label,
                        meters=cell.value,
                        status="no-such-loom",
                        detail=f"Shed {shed.name} has no loom {column.loom_number}.",
                    )
                )
                continue

            entry = ProductionEntry(
                entry_date=entry_date,
                shift=payload.shift,
                pick_type=pick_type,
                worker_id=payload.worker_id,
                loom_id=loom.id,
                meters=round(cell.value, 2),
                rate_per_meter=round(rate, 2),
                total_amount=round(cell.value * rate, 2),
            )
            # Each row goes in its own savepoint, so one duplicate reports
            # itself while the other forty-eight still save. All-or-nothing
            # would mean re-importing a whole sheet because a single day had
            # already been keyed in by hand.
            #
            # The add() must be INSIDE the savepoint. Adding first and then
            # opening one leaves the rejected object pending in the session,
            # so the next flush retries it and every subsequent row fails with
            # PendingRollbackError instead of the one real duplicate.
            savepoint = db.begin_nested()
            try:
                db.add(entry)
                db.flush()
                savepoint.commit()
            except IntegrityError:
                savepoint.rollback()
                rows.append(
                    ImportedRow(
                        entry_date=entry_date,
                        loom_label=label,
                        meters=cell.value,
                        status="duplicate",
                        detail="An entry already exists for this loom, day and shift.",
                    )
                )
                continue

            created += 1
            rows.append(
                ImportedRow(
                    entry_date=entry_date,
                    loom_label=label,
                    meters=cell.value,
                    status="created",
                )
            )

    db.commit()
    return ImportResult(
        created=created,
        skipped=len(rows) - created,
        rows=rows,
    )
