"""Read a photographed weekly register and turn it into production entries.

Two endpoints, deliberately separate:

``extract`` reads the photograph and returns the grid without touching the
database. ``commit`` writes the grid the operator confirmed. Splitting them is
what makes the review step real — there is no code path from a photograph to a
wage record that does not pass through a human.
"""

from datetime import timedelta

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.labels import loom_label
from app.core.register_reader import ReadError, read_register
from app.db.session import get_db
from app.models import Loom, ProductionEntry, Shed, Worker, WorkerLeave
from app.schemas.operations import (
    ImportCommit,
    ImportedRow,
    ImportResult,
    SheetCell,
    SheetColumn,
    SheetOut,
)

router = APIRouter(prefix="/production/import", tags=["production"])

# A phone photo of a diary page is a few megabytes, and the app shrinks it to
# well under one before upload. Anything far past this is a mistake, or an
# attempt to tie the server up decoding it.
MAX_IMAGE_BYTES = 12 * 1024 * 1024


@router.post("/extract", response_model=SheetOut)
async def extract_sheet(
    image: UploadFile = File(...),
    day_count: int = Form(default=7),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
) -> SheetOut:
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
        # CPU-bound for about a second. Run off the event loop so one person
        # reading a sheet does not stall every other request meanwhile.
        sheet = await run_in_threadpool(read_register, content, day_count)
    except ReadError as exc:
        # The message already says what to do about it.
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc))

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

    # Absences first, so a day marked leave is recorded even if it also
    # somehow carried figures — those cells are skipped below.
    leave_indices = {i for i in payload.leave_days if 0 <= i < payload.day_count}
    leave_recorded = 0
    for day_index in sorted(leave_indices):
        leave_date = payload.week_start + timedelta(days=day_index)
        already = db.scalar(
            select(WorkerLeave.id).where(
                WorkerLeave.worker_id == payload.worker_id,
                WorkerLeave.leave_date == leave_date,
            )
        )
        if already is None:
            db.add(
                WorkerLeave(
                    worker_id=payload.worker_id,
                    leave_date=leave_date,
                    note="Marked while reading the weekly sheet.",
                )
            )
            leave_recorded += 1
        rows.append(
            ImportedRow(
                entry_date=leave_date,
                loom_label="—",
                meters=0,
                status="leave",
                detail="Recorded as a leave day; no production saved.",
            )
        )

    for column in payload.columns:
        loom = looms.get(column.loom_number)
        label = loom_label(shed.name, column.loom_number)

        # The loom's own pick and rate win; the sheet-level ones are only a
        # fallback for columns the operator left alone.
        pick_type = column.pick_type or payload.pick_type
        rate = column.rate_per_meter or payload.rate_per_meter

        for day_index, cell in enumerate(column.cells):
            # A day the worker was absent produces nothing, whatever the
            # cell happens to hold. The operator was warned before ticking it.
            if day_index in leave_indices:
                continue

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
