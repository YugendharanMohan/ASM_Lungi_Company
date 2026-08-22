"""Turn positioned words from an OCR engine into the register's grid.

Kept separate from the OCR call itself so the reconstruction — the part most
likely to be wrong — can be tested with hand-built word positions, without a
network round trip or a billing account.

The sheet is a hand-ruled table: loom numbers across the top, one row per day
beneath, and each loom's weekly total at the foot. OCR returns loose words with
bounding boxes and no idea that any of that is a table, so the structure has to
be rebuilt from geometry.

The reconstruction is anchored on the header row rather than clustering the x
axis independently. Independent clustering has to guess how many columns there
are and breaks when a value drifts into its neighbour's column — which happens
on the sample sheet, where the last column's figures crowd the margin. The
header gives real column centres to snap to, so every later value only has to
be nearer the right one than the wrong one.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Word:
    """One OCR token and where it sits on the page."""

    text: str
    x: float  # centre
    y: float  # centre
    confidence: float = 1.0


@dataclass
class Cell:
    value: float | None = None
    confidence: float = 0.0
    raw: str = ""


@dataclass
class Column:
    loom_number: str
    cells: list[Cell] = field(default_factory=list)
    #: The total written under the column, when one was found.
    written_total: float | None = None

    @property
    def computed_total(self) -> float:
        return round(sum(c.value or 0.0 for c in self.cells), 2)

    @property
    def matches(self) -> bool | None:
        """True/False against the written total, None when there is none."""
        if self.written_total is None:
            return None
        return abs(self.computed_total - self.written_total) < 0.005


@dataclass
class Sheet:
    columns: list[Column] = field(default_factory=list)
    day_count: int = 0

    @property
    def grand_total(self) -> float:
        return round(sum(c.computed_total for c in self.columns), 2)

    @property
    def mismatched_looms(self) -> list[str]:
        return [c.loom_number for c in self.columns if c.matches is False]


# "17", "17.50", "02.50", and the trailing dashes the writer uses as a filler
# ("18 —"). A bare dash is not a number; it means the loom was idle.
_NUMBER = re.compile(r"^0*(\d+(?:[.,]\d+)?)")

#: Loom numbers run 1-15 per shed today. The ceiling is loose on purpose —
#: it exists to reject page furniture like a printed year, not to validate
#: the mill's numbering.
MAX_LOOM_NUMBER = 99


def parse_number(raw: str) -> float | None:
    """Read a handwritten figure, or None when the token is not one.

    Leading zeros are normal here ("04", "02.50") and a comma sometimes lands
    where a decimal point was meant, so both are accepted.
    """
    cleaned = raw.strip().replace(" ", "")
    if not cleaned:
        return None
    match = _NUMBER.match(cleaned)
    if not match:
        return None
    try:
        return float(match.group(1).replace(",", "."))
    except ValueError:
        return None


def _typical_gap(values: list[float]) -> float:
    """Median distance between neighbouring values, ignoring near-duplicates.

    Words on the same line differ by a pixel or two; those gaps say nothing
    about line pitch, so they are excluded before taking the median.
    """
    ordered = sorted(values)
    gaps = [
        b - a
        for a, b in zip(ordered, ordered[1:])
        if b - a > 1.0
    ]
    if not gaps:
        return 1.0
    gaps.sort()
    return gaps[len(gaps) // 2]


def _cluster(values: list[float], gap: float) -> list[list[int]]:
    """Group indices whose values are within `gap` of the running cluster."""
    order = sorted(range(len(values)), key=lambda i: values[i])
    clusters: list[list[int]] = []
    for i in order:
        if clusters and values[i] - values[clusters[-1][-1]] <= gap:
            clusters[-1].append(i)
        else:
            clusters.append([i])
    return clusters


def build_sheet(words: list[Word], day_count: int = 7) -> Sheet:
    """Rebuild the grid from positioned words.

    `day_count` comes from the upload form, not from the page. Being told how
    many rows to expect removes the need to guess where the data ends and the
    totals begin — the row after the last day is the totals row, and anything
    below that (the facing page, the printed date, the diary's own furniture)
    is ignored.
    """
    numeric = [w for w in words if parse_number(w.text) is not None]
    if not numeric:
        return Sheet(day_count=day_count)

    # Rows first, split on the typical line pitch.
    #
    # The threshold is the MEDIAN gap between neighbouring lines, not a
    # fraction of the page height. Deriving it from the overall span makes it
    # hostage to a single far-flung token — the facing page's total sits
    # hundreds of pixels below the grid, which inflated the threshold enough to
    # swallow the header row into the diary's printed date above it.
    ys = [w.y for w in numeric]
    row_gap = _typical_gap(ys) * 0.6
    row_groups = _cluster(ys, row_gap)
    rows = [[numeric[i] for i in group] for group in row_groups]
    rows.sort(key=lambda r: min(w.y for w in r))

    # The header is the topmost row that looks like a run of loom numbers.
    # All four conditions earn their place:
    #
    #   * at least three values — the printed year and day number on the diary
    #     page ("23" and "2024") are two whole numbers in increasing x order,
    #     and were being taken for the header before this was tightened;
    #   * whole numbers — day rows carry decimals ("17.50");
    #   * strictly increasing — day rows wander (17, 18, 17);
    #   * within a plausible loom range — which is what actually rules out the
    #     printed "2024".
    header_index = None
    for index, row in enumerate(rows):
        ordered = sorted(row, key=lambda w: w.x)
        values = [parse_number(w.text) for w in ordered]
        if len(values) < 3 or any(v is None for v in values):
            continue
        if not all(v == int(v) and 1 <= v <= MAX_LOOM_NUMBER for v in values):
            continue
        if all(values[i] < values[i + 1] for i in range(len(values) - 1)):
            header_index = index
            break

    if header_index is None:
        return Sheet(day_count=day_count)

    header = sorted(rows[header_index], key=lambda w: w.x)
    columns = [
        Column(loom_number=str(int(parse_number(w.text) or 0))) for w in header
    ]
    centres = [w.x for w in header]

    def column_for(x: float) -> int:
        return min(range(len(centres)), key=lambda i: abs(centres[i] - x))

    body = rows[header_index + 1 :]
    day_rows = body[:day_count]
    totals_row = body[day_count] if len(body) > day_count else []

    for column in columns:
        column.cells = [Cell() for _ in range(day_count)]

    for day_index, row in enumerate(day_rows):
        for word in row:
            value = parse_number(word.text)
            if value is None:
                continue
            cell = columns[column_for(word.x)].cells[day_index]
            # A column can catch two tokens on one line when a figure spills
            # past the ruled line. The first one wins; the review screen is
            # where a human resolves it.
            if cell.value is None:
                cell.value = value
                cell.confidence = word.confidence
                cell.raw = word.text

    for word in totals_row:
        value = parse_number(word.text)
        if value is not None:
            columns[column_for(word.x)].written_total = value

    return Sheet(columns=columns, day_count=day_count)
