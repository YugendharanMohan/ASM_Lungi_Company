"""Reading a register photo, end to end, on a register drawn by this test.

A real sheet cannot live in a public repository — it carries a worker's name
and pay — so the page is drawn here instead: ruled columns, a script font for
the figures, filler dashes, a slight tilt, a day of leave, and a loom count
different from the sheet the reader was developed against. Accuracy on real
handwriting was measured separately (44 of 49 figures on the first sheet);
this guards the machinery that finds and reads the cells.

Run from backend/:  PYTHONPATH=. .venv/bin/python tests/test_register_reader.py
"""

import cv2
import numpy as np

from app.core.register_reader import DAY_MAX, TOTAL_MAX, read_figure, read_register

# --- figures ----------------------------------------------------------------

FIGURES = [
    ("17-50", DAY_MAX, 17.5),    # a half written after the filler dash
    ("19:-50", DAY_MAX, 19.5),   # decimal point read as a colon
    ("187", DAY_MAX, 18.0),      # filler dash read as a trailing 7
    ("031", DAY_MAX, 3.0),       # ... or as a trailing 1
    ("1T-", DAY_MAX, 17.0),      # a 7 read as T
    ("—18", DAY_MAX, 18.0),      # the previous column's dash reaching in
    ("1750", DAY_MAX, 17.5),     # the decimal point lost entirely
    ("02.52", DAY_MAX, 2.5),     # kept to the half metre
    ("", DAY_MAX, None),
    ("三一", DAY_MAX, None),      # not a figure: left for a person
    ("10650", TOTAL_MAX, 106.5),
    ("110.57", TOTAL_MAX, 110.5),
    ("103-", TOTAL_MAX, 103.0),
]
for raw, ceiling, expected in FIGURES:
    got = read_figure(raw, ceiling)
    assert got == expected, f"read_figure({raw!r}) = {got}, expected {expected}"
print(f"  figures: {len(FIGURES)} cases ok")

# --- a drawn register ---------------------------------------------------------

LOOMS = [3, 4, 5, 6, 7]
LEAVE_DAY = 2
DAYS = [
    [4, 17.5, None, 16, 18, 17, 17.5],
    [3.5, 18, None, 17, 17, 18, 16],
    [4, 16.5, None, 18, 17.5, 16, 18],
    [2.5, 17, None, 19, 18, 17, 17],
    [3, 18.5, None, 17, 16, 18.5, 18],
]


def figure_text(value: float) -> str:
    return f"{int(value):02d}" if value == int(value) else f"{int(value):02d}.50"


def draw_register() -> bytes:
    w, h = 1200, 1100
    page = np.full((h, w, 3), (232, 238, 241), np.uint8)
    rng = np.random.default_rng(7)
    page = np.clip(page.astype(int) + rng.integers(-6, 6, page.shape), 0, 255).astype(np.uint8)
    ink = (120, 40, 20)
    font = cv2.FONT_HERSHEY_SCRIPT_SIMPLEX

    left, pitch_x, top, pitch_y = 140, 190, 170, 70
    # The diary's own printed lines: faint, evenly spaced, edge to edge.
    for r in range(12):
        y = top + 25 + r * pitch_y
        for x in range(60, w - 60, 9):
            cv2.line(page, (x, y), (x + 4, y), (200, 205, 208), 1)
    # Hand-ruled lines between the columns only, as on the real register.
    for c in range(1, len(LOOMS)):
        x = left + c * pitch_x
        cv2.line(page, (x, top - 40), (x + 3, top + 9 * pitch_y + 30), ink, 2)

    for c, loom in enumerate(LOOMS):
        cx = left + c * pitch_x + 20
        cv2.putText(page, str(loom), (cx + 50, top), font, 1.6, ink, 3)
        for d, value in enumerate(DAYS[c]):
            y = top + (d + 1) * pitch_y
            if value is None:
                continue
            text = figure_text(value)
            cv2.putText(page, text, (cx, y), font, 1.5, ink, 3)
            end = cx + cv2.getTextSize(text, font, 1.5, 3)[0][0] + 8
            cv2.line(page, (end, y - 14), (end + 30, y - 16), ink, 2)  # filler dash
        total = sum(v for v in DAYS[c] if v is not None)
        cv2.putText(page, figure_text(total) if total < 100 else f"{total:g}",
                    (cx, top + 8 * pitch_y), font, 1.5, ink, 3)

    # Photographed slightly off square.
    matrix = cv2.getRotationMatrix2D((w / 2, h / 2), 1.2, 1.0)
    page = cv2.warpAffine(page, matrix, (w, h), borderValue=(232, 238, 241))
    ok, encoded = cv2.imencode(".jpg", page, [cv2.IMWRITE_JPEG_QUALITY, 85])
    assert ok
    return encoded.tobytes()


sheet = read_register(draw_register(), day_count=7)
found = [c.loom_number for c in sheet.columns]
print(f"  looms found: {found}")
assert found == [str(n) for n in LOOMS], f"expected looms {LOOMS}, found {found}"

wrong = 0
for column, truth in zip(sheet.columns, DAYS):
    for day, (cell, expected) in enumerate(zip(column.cells, truth)):
        if day == LEAVE_DAY:
            assert cell.value is None, (
                f"loom {column.loom_number}: the leave day read as {cell.value!r}; "
                "a blank row must stay blank, not borrow the next day's figure"
            )
        elif cell.value != expected:
            wrong += 1
            print(f"    misread: loom {column.loom_number} day {day + 1}: "
                  f"{cell.raw!r} -> {cell.value}, page says {expected}")

    # The property the review screen depends on: a column never balances
    # while it holds a wrong figure. Accuracy can vary; this cannot.
    if column.matches:
        assert all(
            c.value == t for c, t in zip(column.cells, truth) if t is not None
        ), f"loom {column.loom_number} balances despite a misread figure"

written = sum(1 for column in DAYS for value in column if value is not None)
print(f"  figures read: {written - wrong}/{written}   leave day blank in every column")
assert wrong <= 3, f"{wrong} misreads on a clean drawn page"
print("\n  all assertions passed")
