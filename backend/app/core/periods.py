"""Calendar period boundaries.

The mill's week runs Monday to Sunday, which is also what ISO uses, so weekly
wage totals line up with the week number people already say out loud.
"""

from datetime import date, timedelta


def week_bounds(day: date) -> tuple[date, date]:
    start = day - timedelta(days=day.weekday())
    return start, start + timedelta(days=6)


def month_bounds(day: date) -> tuple[date, date]:
    start = day.replace(day=1)
    if start.month == 12:
        next_month = start.replace(year=start.year + 1, month=1)
    else:
        next_month = start.replace(month=start.month + 1)
    return start, next_month - timedelta(days=1)


def resolve_period(
    period: str, reference: date
) -> tuple[date, date]:
    """Map a period name onto concrete inclusive bounds."""
    if period == "daily":
        return reference, reference
    if period == "weekly":
        return week_bounds(reference)
    if period == "monthly":
        return month_bounds(reference)
    raise ValueError(f"Unknown period '{period}'.")
