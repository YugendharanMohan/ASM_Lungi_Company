"""Read a photographed weekly register, without any paid service.

The register is a hand-ruled table: loom numbers across the top, one row per
day, the week's total for each loom underneath. Two stages, deliberately
separate:

1. **Find the cells** from the page itself — the ruled lines give the
   columns, and the diary's evenly printed lines give the rows. No OCR is
   involved, so nothing here depends on reading the writing correctly.
2. **Read each cell on its own** with a small handwriting recogniser.

Reading cell by cell is the whole trick. Whole-page OCR engines look for lines
of text, and the dashes this register uses as filler ("17 —") join
neighbouring figures into one run of ink, so the page comes back as strings
like "04-03--04-04" that no grid can be rebuilt from. Tested on a real sheet,
whole-page reading got 3 of 49 figures right; cell by cell, 44.

Only the recogniser model is borrowed (see ``app/ocr_model/NOTICE.md``). It
runs on onnxruntime directly rather than through the RapidOCR package, whose
dependency on the full OpenCV build needs graphics libraries a bare Linux
server does not have.
"""

from __future__ import annotations

import hashlib
import logging
import math
import re
from functools import lru_cache
from pathlib import Path

from app.core.sheet_grid import Cell, Column, Sheet

logger = logging.getLogger(__name__)

MODEL_PATH = Path(__file__).resolve().parent.parent / "ocr_model" / "PP-OCRv6_rec_small.onnx"
MODEL_SHA256 = "6f327246b50388f3c176ae304bd95767ea6dc0c9ae92153ef8cbe210b3c14884"

#: A loom cannot weave more than this in one shift.
DAY_MAX = 25.0
#: A week's column total: seven shifts at DAY_MAX, with room.
TOTAL_MAX = 200.0
#: Loom numbers are small; this rejects page furniture, not the mill's numbering.
LOOM_MAX = 99

#: A cell whose tallest mark is below this share of its height holds no
#: writing. Measured on a real sheet after joining strokes within 3px: written
#: cells, including single-digit headers, 0.61-1.00; blank ones (specks of the
#: printed line, smudges) 0.07-0.28.
BLANK_STROKE_RATIO = 0.45


class ReadError(RuntimeError):
    """The photograph could not be read. The message says what to do."""


# --------------------------------------------------------------------------
# Figures
# --------------------------------------------------------------------------

_LOOKALIKES = str.maketrans(
    {
        "T": "7", "t": "7", "l": "1", "I": "1", "|": "1", "O": "0", "o": "0",
        ":": ".", ",": ".", "·": ".",
        "—": "-", "–": "-", "=": "-", "~": "-", "_": "-", "一": "-",
    }
)


def read_figure(raw: str, ceiling: float = DAY_MAX) -> float | None:
    """Turn the recogniser's text into a figure, using what the register allows.

    Every figure is whole or half metres and bounded by what a loom can weave.
    Those two facts correct the recogniser's systematic misreadings — and
    nothing beyond them, so a figure they do not cover comes back as None for
    a person to fill in rather than as a confident guess.
    """
    text = (raw or "").translate(_LOOKALIKES).replace(" ", "")
    text = re.sub(r"[^0-9.\-]", "", text)
    # The previous column's filler dash can reach into this cell from the left.
    text = text.lstrip(".-")
    if not re.search(r"\d", text):
        return None

    # The decimal point is small and often lost: "1750" is 17.50, "10650" is
    # 106.50. Only for four or more digits, so "150" stays open to being 15
    # with a filler dash read as a zero.
    lost_point = re.fullmatch(r"0*(\d{2,3})50-*", text)
    if lost_point and len(text.rstrip("-")) >= 4 and int(lost_point.group(1)) + 0.5 <= ceiling:
        return int(lost_point.group(1)) + 0.5

    # A half written after the filler dash: "17-50", "19.-50", "17-52".
    half = re.match(r"^0*(\d{1,3})[.\-]+5\d?", text)
    if half and int(half.group(1)) + 0.5 <= ceiling:
        return int(half.group(1)) + 0.5

    match = re.match(r"^0*(\d{1,3})(?:\.(\d+))?", text)
    if not match:
        return None
    whole, fraction = int(match.group(1)), match.group(2)

    # A trailing filler dash read as one more digit: "187" is 18, "031" is 03.
    while whole > ceiling and whole >= 10:
        whole //= 10
        fraction = None
    if whole > ceiling:
        return None
    if fraction:
        # Kept to the half metre, so ".52" and ".57" are ".50".
        return whole + (0.5 if fraction[0] in "4567" else 0.0)
    return float(whole)


# --------------------------------------------------------------------------
# Recogniser
# --------------------------------------------------------------------------


@lru_cache
def _recogniser():
    """Load the model once per process. Raises ReadError if it cannot."""
    try:
        import numpy as np  # noqa: F401 - imported here so boot never needs it
        import onnxruntime as ort
    except ImportError as exc:
        raise ReadError(
            "Reading photographs is not installed on this server."
        ) from exc

    if not MODEL_PATH.exists():
        raise ReadError("The handwriting model is missing from this server.")
    digest = hashlib.sha256(MODEL_PATH.read_bytes()).hexdigest()
    if digest != MODEL_SHA256:
        # A truncated checkout or a failed LFS-style download would otherwise
        # load and quietly produce nonsense.
        raise ReadError("The handwriting model on this server is damaged.")

    options = ort.SessionOptions()
    # Two threads: enough to read a sheet in about a second, without taking
    # every core from the requests the rest of the app is serving.
    options.intra_op_num_threads = 2
    session = ort.InferenceSession(
        str(MODEL_PATH), options, providers=["CPUExecutionProvider"]
    )
    raw = session.get_modelmeta().custom_metadata_map.get("character", "")
    # Index 0 is CTC's blank and the last index a space — the layout the
    # model was trained with.
    characters = ["\0"] + raw.splitlines() + [" "]
    return session, characters


def is_available() -> bool:
    try:
        _recogniser()
        return True
    except ReadError:
        return False


def _recognise(crop) -> str:
    """Read one line of writing from a BGR image of a single cell."""
    import cv2
    import numpy as np

    session, characters = _recogniser()
    height = 48
    h, w = crop.shape[:2]
    if h == 0 or w == 0:
        return ""
    width = max(1, int(math.ceil(height * w / h)))
    padded_width = max(width, 320)
    image = cv2.resize(crop, (width, height)).astype("float32")
    image = (image.transpose(2, 0, 1) / 255 - 0.5) / 0.5
    batch = np.zeros((1, 3, height, padded_width), dtype=np.float32)
    batch[0, :, :, :width] = image

    probs = session.run(None, {session.get_inputs()[0].name: batch})[0][0]
    indices = probs.argmax(axis=1)
    out, previous = [], -1
    for index in indices:
        # Greedy CTC: collapse repeats, drop the blank.
        if index != previous and index != 0 and index < len(characters):
            out.append(characters[index])
        previous = index
    return "".join(out)


# --------------------------------------------------------------------------
# Finding the table
# --------------------------------------------------------------------------


def _runs(mask, min_length: int) -> list[tuple[int, int]]:
    runs, i, n = [], 0, len(mask)
    while i < n:
        if mask[i]:
            start = i
            while i < n and mask[i]:
                i += 1
            if i - start >= min_length:
                runs.append((start, i))
        i += 1
    return runs


def _find_grid(image, day_count: int):
    """Locate every cell. Returns column edges and, per column, row boxes.

    Rows per column are: the header, one per day, then the totals.
    """
    import cv2
    import numpy as np

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    ink = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 25, 15
    )
    # Hand-ruled lines are faint and broken, so the kernel is short. That lets
    # page edges and the binding through too; spacing sorts those out below.
    vertical = cv2.morphologyEx(
        ink, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, h // 30))
    )
    horizontal = cv2.morphologyEx(
        ink, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (w // 20, 1))
    )

    # Columns: the longest run of evenly spaced vertical lines.
    strength = np.convolve(vertical.sum(axis=0).astype(float), np.ones(9) / 9, "same")
    peaks: list[int] = []
    for x in np.argsort(strength)[::-1]:
        if strength[x] <= 0:
            break
        if all(abs(int(x) - p) > w // 25 for p in peaks):
            peaks.append(int(x))
        if len(peaks) == 24:
            break
    peaks.sort()
    best: list[int] = []
    for i in range(len(peaks)):
        for j in range(i + 1, len(peaks)):
            run, gap = [peaks[i], peaks[j]], peaks[j] - peaks[i]
            for p in peaks[j + 1 :]:
                if abs((p - run[-1]) - gap) <= gap * 0.2:
                    run.append(p)
            if len(run) > len(best):
                best = run
    if len(best) < 2:
        raise ReadError(
            "Could not find the ruled lines between the loom columns. "
            "Photograph the page flat and square, with the whole table in view."
        )
    pitch_x = (best[-1] - best[0]) / (len(best) - 1)
    edges = [int(best[0] - pitch_x), *best, int(best[-1] + pitch_x)]
    # An outer column that would fall mostly off the photo is not a column.
    edges = [e for e in edges if -pitch_x * 0.5 < e < w + pitch_x * 0.5]
    edges = [max(0, min(w - 1, e)) for e in edges]

    # Vertical extent. Each line is sampled across a band scaled to the column
    # spacing rather than a few fixed pixels: a phone photo is rarely square,
    # and a ruled line tilted by a degree drifts well over ten pixels along its
    # length. Sampled narrowly, the top of every line was lost, the table was
    # judged to start below the loom numbers, and every row was read one out.
    # The table is wherever most lines agree, so one stray stroke cannot
    # stretch it.
    reach = max(5, int(pitch_x * 0.08))
    votes = np.zeros(h, dtype=int)
    for x in best:
        votes += vertical[:, max(0, x - reach) : x + reach + 1].max(axis=1) > 0
    ys = np.where(votes >= max(2, len(best) // 2))[0]
    if len(ys) == 0:
        raise ReadError(
            "Could not tell where the table starts and ends. Photograph the "
            "page flat, with the whole table in view."
        )
    top = max(0, int(ys.min()) - 10)
    bottom = min(h, int(ys.max()) + int((ys.max() - ys.min()) * 0.5))

    # Rows. The figures sit on the diary's printed lines, which are evenly
    # spaced, so each band of writing is placed on its nearest printed line
    # rather than demanding that every row carries ink: a day of leave is a
    # blank row, and must not shift every day after it.
    writing = cv2.subtract(cv2.subtract(ink, vertical), horizontal)
    need = day_count + 2
    bands = []  # (column index, centre x, centre y, height)
    for c in range(len(edges) - 1):
        x0, x1 = edges[c] + 8, edges[c + 1] - 8
        if x1 - x0 < 10:
            continue
        profile = writing[top:bottom, x0:x1].sum(axis=1).astype(float) / 255
        profile = np.convolve(profile, np.ones(5) / 5, "same")
        for a, b in _runs(profile > max(profile.max() * 0.12, 3), 15):
            bands.append((c, (edges[c] + edges[c + 1]) / 2, (a + b) / 2 + top, b - a))
    if len(bands) < need:
        raise ReadError(
            "Found the columns but not enough rows of figures in them. Check "
            "the photo shows every day and the totals underneath."
        )

    heights = sorted(b[3] for b in bands)
    typical = heights[len(heights) // 2]
    pieces = []  # two rows touching form one tall band; split it
    for c, cx, cy, bh in bands:
        k = max(1, round(bh / (typical * 1.25)))
        for i in range(k):
            pieces.append((c, cx, cy - bh / 2 + bh * (i + 0.5) / k))

    gaps = []
    for c in {p[0] for p in pieces}:
        column_ys = sorted(p[2] for p in pieces if p[0] == c)
        gaps += [b - a for a, b in zip(column_ys, column_ys[1:])]
    gaps.sort()
    pitch_y = gaps[len(gaps) // 2]

    # Header: the first band in each column, fitted as a line across the page
    # (which follows a photo taken at a slant). Columns whose first band sits
    # far from the others — an unreadable header, say — are left out of the fit.
    firsts: dict[int, tuple[float, float]] = {}
    for c, cx, cy in pieces:
        if c not in firsts or cy < firsts[c][1]:
            firsts[c] = (cx, cy)
    points = list(firsts.values())
    median_y = sorted(p[1] for p in points)[len(points) // 2]
    points = [p for p in points if abs(p[1] - median_y) < pitch_y * 0.5] or points
    if len({p[0] for p in points}) > 1:
        header = np.polyfit([p[0] for p in points], [p[1] for p in points], 1)
    else:
        header = np.array([0.0, points[0][1]])

    by_row: dict[int, list[tuple[float, float]]] = {r: [] for r in range(need)}
    for c, cx, cy in pieces:
        r = round((cy - np.polyval(header, cx)) / pitch_y)
        if 0 <= r < need:
            by_row[r].append((cx, cy))
    fits = []
    for r in range(need):
        pts = by_row[r]
        if len({p[0] for p in pts}) >= 2:
            fits.append(np.polyfit([p[0] for p in pts], [p[1] for p in pts], 1))
        else:
            # Nobody wrote on this line in any column: place it by pitch.
            fits.append(header + np.array([0.0, r * pitch_y]))

    half = max(typical, pitch_y * 0.7) / 2 + 4
    grid = []
    for c in range(len(edges) - 1):
        x0, x1 = edges[c] + 8, edges[c + 1] - 8
        cx = (edges[c] + edges[c + 1]) / 2
        grid.append(
            [
                (x0, int(np.polyval(fits[r], cx) - half), x1, int(np.polyval(fits[r], cx) + half))
                for r in range(need)
            ]
        )
    return edges, grid


def _is_blank(crop) -> bool:
    """True when a cell holds no writing — only specks of the printed line."""
    import cv2
    import numpy as np

    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    ink = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 25, 15
    )
    long_strokes = cv2.morphologyEx(
        ink,
        cv2.MORPH_OPEN,
        cv2.getStructuringElement(cv2.MORPH_RECT, (max(15, gray.shape[1] // 5), 1)),
    )
    ink = cv2.morphologyEx(cv2.subtract(ink, long_strokes), cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    # Join strokes of one digit before measuring. A handwritten 9 is often a
    # loop and a separate tail, neither tall alone; measured unjoined, a
    # single-digit loom number was taken for an empty cell.
    ink = cv2.dilate(ink, np.ones((3, 3), np.uint8))
    count, _, stats, _ = cv2.connectedComponentsWithStats(ink)
    tallest = max((stats[i, cv2.CC_STAT_HEIGHT] for i in range(1, count)), default=0)
    return tallest < gray.shape[0] * BLANK_STROKE_RATIO


# --------------------------------------------------------------------------
# The sheet
# --------------------------------------------------------------------------


def read_register(image_bytes: bytes, day_count: int = 7) -> Sheet:
    """Read a register photograph into a Sheet. Raises ReadError."""
    import cv2
    import numpy as np

    _recogniser()  # fail fast, before any image work, if reading is unavailable
    image = cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ReadError("That file is not a photograph this server can open.")

    edges, grid = _find_grid(image, day_count)
    h, w = image.shape[:2]
    pitch_x = (edges[-1] - edges[0]) / max(1, len(edges) - 1)

    def crop(box, first_column: bool):
        x0, y0, x1, y1 = box
        # The first column's figures spill left into the empty margin; every
        # other column's left side holds the previous figure's filler dash.
        pad = int(pitch_x * 0.2) if first_column else 0
        return image[max(0, y0) : min(h, y1), max(0, x0 - pad) : min(w, x1)]

    # Every column is read in full. Whether its header is a loom number only
    # decides what the column is called — not whether its figures count.
    read: list[tuple[Column, bool]] = []
    for c, boxes in enumerate(grid):
        first = c == 0
        header_crop = crop(boxes[0], first)
        loom = None if _is_blank(header_crop) else read_figure(_recognise(header_crop), LOOM_MAX)
        is_loom = loom is not None and loom == int(loom) and loom >= 1

        column = Column(loom_number=str(int(loom)) if is_loom else "?", cells=[])
        for d in range(day_count):
            cell_crop = crop(boxes[d + 1], first)
            if _is_blank(cell_crop):
                column.cells.append(Cell(value=None, confidence=1.0, raw=""))
                continue
            text = _recognise(cell_crop)
            value = read_figure(text, DAY_MAX)
            # A figure the rules had to repair, or could not read at all, is
            # marked low so the review screen draws the eye to it.
            clean = value is not None and re.fullmatch(r"0*\d{1,2}(\.\d{1,2})?-*", text or "")
            column.cells.append(Cell(value=value, confidence=0.95 if clean else 0.4, raw=text))

        total_crop = crop(boxes[day_count + 1], first)
        if not _is_blank(total_crop):
            column.written_total = read_figure(_recognise(total_crop), TOTAL_MAX)
        read.append((column, is_loom))

    # Trim the ends to the first and last column with a real loom number: what
    # lies outside is the page edge or the facing page's margin. A column in
    # the middle whose header could not be read is kept, figures and all,
    # under "?" for a person to name — dropping it would lose real metres.
    loom_positions = [i for i, (_, ok) in enumerate(read) if ok]
    if not loom_positions:
        raise ReadError(
            "Found the table but could not read any loom numbers across the "
            "top. Check the header row is in the photo and not in shadow."
        )
    kept = [col for col, _ in read[loom_positions[0] : loom_positions[-1] + 1]]
    return Sheet(columns=kept, day_count=day_count)
