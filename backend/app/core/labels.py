"""How a loom is named wherever a person reads it.

One definition, used by the API, the salary report and the printed receipt, so
the name on a wage slip always matches the name on screen. The shed carries the
letters and the loom carries a plain number — "AA - 3", never "AA3", which
reads as one opaque code and hides which shed it belongs to.
"""


def loom_label(shed_name: str | None, loom_number: str | None) -> str:
    shed = (shed_name or "").strip()
    loom = (loom_number or "").strip()
    if shed and loom:
        return f"{shed} - {loom}"
    return shed or loom or "—"


def loom_sort_key(
    shed_name: str | None, loom_number: str | None
) -> tuple[str, int, str]:
    """Order looms the way the floor is walked: A-1, A-2, A-10 — not A-1,
    A-10, A-2.

    Loom numbers are stored as text, because a mill may label a loom "3A". A
    database ORDER BY therefore sorts them as strings, which puts 10 before 2.
    Sorting happens in Python rather than SQL so the result is identical on
    PostgreSQL and on the SQLite used in development; the loom count is in the
    tens, so the cost is irrelevant.

    Non-numeric labels sort after the numbered ones, alphabetically among
    themselves, so "3A" does not silently collide with "3".
    """
    shed = (shed_name or "").strip()
    loom = (loom_number or "").strip()
    return (shed, int(loom) if loom.isdigit() else 10**9, loom)


def loom_label_sort_key(label: str) -> tuple[str, int, str]:
    """The same ordering, for an already-formatted "Shed - Loom" label."""
    shed, _, loom = label.partition(" - ")
    return loom_sort_key(shed, loom)
