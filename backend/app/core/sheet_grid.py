"""The shape of a read register: loom columns, one cell per day, a total.

How the grid is found on a photograph lives in :mod:`app.core.register_reader`.
These are only the result — plain data the API serialises and the checksum
runs over, independent of how any figure was read.
"""

from __future__ import annotations

from dataclasses import dataclass, field


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
