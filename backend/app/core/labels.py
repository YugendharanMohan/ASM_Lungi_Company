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
