"""Printed salary receipt.

Rendered server-side so the slip a worker is handed is byte-identical whoever
prints it, rather than depending on a browser's print dialog.

Layout follows the mill's existing paper slip: worker and period at the top, a
day-by-day grid of metres per loom, per-loom totals, and the money. The one
addition is the rate breakdown — with several picks in play a single blended
figure cannot be checked by the person being paid, so each rate band is
totalled on its own line and those lines sum to the amount due.

The sheet is sized to fit one landscape A4. Rather than fixing a row height
that suits a week and overflows for a month, the tables are laid out at the
largest of several type scales that measures small enough to fit; see
:func:`render_receipt_pdf`.
"""

from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Flowable,
    Frame,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

from app.schemas.operations import SalaryReceipt

INK = colors.HexColor("#1D1D1F")
MUTED = colors.HexColor("#6E6E73")
RULE = colors.HexColor("#C7C7CC")
BAND = colors.HexColor("#F2F2F4")

MARGIN = 12 * mm
GAP = 5 * mm

# Beyond this many looms the grid stops fitting across the page, so it is split
# into further blocks rather than shrinking the type to unreadable.
MAX_LOOM_COLUMNS = 9


@dataclass(frozen=True)
class Scale:
    """One rung of the type ladder used to fit the page."""

    font: float
    pad: float


# Tried largest first. The floor is 6pt, still legible in print — below that the
# receipt stops being readable and is better off running to a second page,
# which is what happens when nothing on the ladder fits.
SCALES = (
    Scale(8.0, 3.2),
    Scale(7.5, 2.7),
    Scale(7.0, 2.2),
    Scale(6.5, 1.8),
    Scale(6.0, 1.5),
)


def _fmt(value: float | None) -> str:
    return "—" if value is None else f"{value:.1f}"


def _money(value: float) -> str:
    return f"Rs {value:,.2f}"


def _date(value) -> str:
    return value.strftime("%d/%m")


def _grid_style(scale: Scale) -> TableStyle:
    return TableStyle(
        [
            ("FONTNAME", (0, 0), (-1, -1), "Courier"),
            ("FONTNAME", (0, 0), (-1, 0), "Courier-Bold"),
            ("FONTNAME", (0, 1), (0, -1), "Courier-Bold"),
            ("FONTNAME", (0, -1), (-1, -1), "Courier-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), scale.font),
            # LEADING must be set alongside FONTSIZE. reportlab keeps a cell's
            # leading at its 12pt default otherwise, so shrinking the font
            # alone leaves the row height untouched and the page never fits.
            ("LEADING", (0, 0), (-1, -1), scale.font * 1.25),
            ("TEXTCOLOR", (0, 0), (-1, -1), INK),
            ("BACKGROUND", (0, 0), (-1, 0), BAND),
            ("BACKGROUND", (0, -1), (-1, -1), BAND),
            ("GRID", (0, 0), (-1, -1), 0.6, RULE),
            ("ALIGN", (1, 0), (-1, -1), "CENTER"),
            ("ALIGN", (0, 0), (0, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), scale.pad),
            ("BOTTOMPADDING", (0, 0), (-1, -1), scale.pad),
            ("LEFTPADDING", (0, 0), (-1, -1), 3),
            ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ]
    )


def _panel_style(scale: Scale, total_row: bool) -> TableStyle:
    commands = [
        ("FONTNAME", (0, 0), (-1, -1), "Courier"),
        ("FONTNAME", (0, 0), (-1, 0), "Courier-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), scale.font),
        ("LEADING", (0, 0), (-1, -1), scale.font * 1.25),
        ("TEXTCOLOR", (0, 0), (-1, -1), INK),
        ("BACKGROUND", (0, 0), (-1, 0), BAND),
        ("GRID", (0, 0), (-1, -1), 0.6, RULE),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("TOPPADDING", (0, 0), (-1, -1), scale.pad + 0.6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), scale.pad + 0.6),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]
    if total_row:
        commands += [
            ("FONTNAME", (0, -1), (-1, -1), "Courier-Bold"),
            ("BACKGROUND", (0, -1), (-1, -1), BAND),
        ]
    else:
        commands.append(("FONTNAME", (0, 1), (0, -1), "Courier-Bold"))
    return TableStyle(commands)


def _header(receipt: SalaryReceipt) -> Table:
    name_style = ParagraphStyle(
        "name", fontName="Courier-Bold", fontSize=15, leading=19, textColor=INK
    )
    label_style = ParagraphStyle(
        "period-label",
        fontName="Courier",
        fontSize=7.5,
        leading=10,
        textColor=MUTED,
        alignment=TA_RIGHT,
    )
    value_style = ParagraphStyle(
        "period-value",
        fontName="Courier-Bold",
        fontSize=10,
        leading=13,
        textColor=INK,
        alignment=TA_RIGHT,
    )

    left = Table(
        [[Paragraph(receipt.worker_name.upper(), name_style)]],
        colWidths=[95 * mm],
    )
    left.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 1.1, INK),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )

    right = Table(
        [
            [Paragraph("PERIOD", label_style)],
            [
                Paragraph(
                    f"{receipt.start_date:%Y-%m-%d} to {receipt.end_date:%Y-%m-%d}",
                    value_style,
                )
            ],
        ],
        colWidths=[85 * mm],
    )
    right.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 1.1, INK),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )

    wrapper = Table([[left, "", right]], colWidths=[95 * mm, None, 85 * mm])
    wrapper.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    return wrapper


def _daily_grids(
    receipt: SalaryReceipt, available_width: float, scale: Scale
) -> list[Flowable]:
    """The date × loom grid, split into blocks that fit the page width."""
    labels = receipt.loom_labels
    if not labels:
        return []

    date_width = 20 * mm
    total_width = 20 * mm
    # Column width comes from the widest block, not each block's own count.
    # Otherwise a trailing block of two looms stretches those columns across
    # the whole page and reads as a different table.
    loom_width = (available_width - date_width - total_width) / min(
        len(labels), MAX_LOOM_COLUMNS
    )

    flowables: list[Flowable] = []
    for offset in range(0, len(labels), MAX_LOOM_COLUMNS):
        chunk = labels[offset : offset + MAX_LOOM_COLUMNS]
        indices = range(offset, offset + len(chunk))

        rows: list[list[str]] = [["DATE", *chunk, "TOTAL"]]
        for row in receipt.rows:
            cells = [_fmt(row.cells[i].meters) for i in indices]
            block_total = sum(row.cells[i].meters or 0.0 for i in indices)
            rows.append([_date(row.entry_date), *cells, f"{block_total:.1f}"])

        totals = [_fmt(receipt.loom_totals[i].meters) for i in indices]
        block_sum = sum(receipt.loom_totals[i].meters or 0.0 for i in indices)
        rows.append(["TOTAL", *totals, f"{block_sum:.1f}"])

        table = Table(
            rows,
            colWidths=[date_width, *([loom_width] * len(chunk)), total_width],
            repeatRows=1,
        )
        table.setStyle(_grid_style(scale))
        flowables.append(table)
        flowables.append(Spacer(1, GAP))

    return flowables


def _loom_totals_table(receipt: SalaryReceipt, scale: Scale) -> Table:
    rows = [["LOOM", "TOTAL METERS"]]
    rows += [
        [cell.loom_label, f"{cell.meters or 0:.1f}"]
        for cell in receipt.loom_totals
    ]
    table = Table(rows, colWidths=[34 * mm, 34 * mm])
    table.setStyle(_panel_style(scale, total_row=False))
    return table


def _rate_table(receipt: SalaryReceipt, scale: Scale) -> Table:
    """Metres grouped by piece rate — the part that has to add up by hand."""
    rows = [["PICK", "RATE", "METERS", "AMOUNT"]]
    rows += [
        [
            ", ".join(group.pick_types),
            f"{group.rate:.2f}",
            f"{group.meters:.1f}",
            f"{group.amount:,.2f}",
        ]
        for group in receipt.rate_groups
    ]
    rows.append(
        [
            "TOTAL",
            "",
            f"{receipt.total_meters:.1f}",
            f"{receipt.total_amount:,.2f}",
        ]
    )

    table = Table(rows, colWidths=[30 * mm, 20 * mm, 24 * mm, 30 * mm])
    table.setStyle(_panel_style(scale, total_row=True))
    return table


def _total_pay(receipt: SalaryReceipt) -> Table:
    """The figure the whole sheet exists to state.

    Metres and average rate used to sit above it. Both are gone: the metres
    total is already the last line of the rate table, and an average rate is
    not a number anyone is paid — printing it beside the amount only invited
    the question of why metres × average does not reconcile.
    """
    label = ParagraphStyle(
        "pay-label",
        fontName="Courier-Bold",
        fontSize=11,
        leading=14,
        textColor=MUTED,
    )
    value = ParagraphStyle(
        "pay-value",
        fontName="Courier-Bold",
        fontSize=17,
        leading=21,
        textColor=INK,
        alignment=TA_RIGHT,
    )

    table = Table(
        [
            [Paragraph("TOTAL PAY", label)],
            [Paragraph(_money(receipt.total_amount), value)],
        ],
        colWidths=[80 * mm],
    )
    table.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 1.2, INK),
                ("BACKGROUND", (0, 0), (-1, -1), BAND),
                ("TOPPADDING", (0, 0), (-1, 0), 8),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 0),
                ("TOPPADDING", (0, 1), (-1, 1), 2),
                ("BOTTOMPADDING", (0, 1), (-1, 1), 9),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    return table


def _build_story(
    receipt: SalaryReceipt, width: float, scale: Scale
) -> list[Flowable]:
    story: list[Flowable] = [_header(receipt), Spacer(1, GAP)]

    if not receipt.rows:
        story.append(
            Paragraph(
                "No production recorded for this period.",
                ParagraphStyle(
                    "empty", fontName="Courier", fontSize=10, textColor=MUTED
                ),
            )
        )
        return story

    story.extend(_daily_grids(receipt, width, scale))

    # Loom totals, rate breakdown and the money sit side by side rather than
    # stacked: the page is landscape and the grid above leaves a wide empty
    # band, so stacking them spent height for nothing.
    lower = Table(
        [
            [
                _loom_totals_table(receipt, scale),
                "",
                _rate_table(receipt, scale),
                "",
                _total_pay(receipt),
            ]
        ],
        colWidths=[68 * mm, 6 * mm, 104 * mm, 6 * mm, 80 * mm],
    )
    lower.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    story.append(lower)
    return story


def _story_height(story: list[Flowable], width: float, height: float) -> float:
    """Height the story needs when laid out at this width."""
    return sum(flowable.wrap(width, height)[1] for flowable in story)


def render_receipt_pdf(receipt: SalaryReceipt) -> bytes:
    page_width, page_height = landscape(A4)
    width = page_width - 2 * MARGIN
    height = page_height - 2 * MARGIN

    # Largest scale that fits on one page wins. Falling off the end of the
    # ladder means the period is genuinely too long for a single sheet; the
    # smallest scale is kept and the grid paginates, repeating its header row.
    story = _build_story(receipt, width, SCALES[-1])
    for scale in SCALES:
        candidate = _build_story(receipt, width, scale)
        if _story_height(candidate, width, height) <= height:
            story = candidate
            break

    buffer = BytesIO()
    doc = BaseDocTemplate(
        buffer,
        pagesize=landscape(A4),
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN,
        bottomMargin=MARGIN,
        title=f"Salary receipt — {receipt.worker_name}",
        author="ASM Lungi Company",
    )
    # An explicit zero-padded frame, so the space measured above is exactly the
    # space available. SimpleDocTemplate adds 6pt of frame padding per side,
    # which was enough to push a sheet that measured as fitting onto page two.
    doc.addPageTemplates(
        PageTemplate(
            id="receipt",
            frames=[
                Frame(
                    MARGIN,
                    MARGIN,
                    width,
                    height,
                    leftPadding=0,
                    rightPadding=0,
                    topPadding=0,
                    bottomPadding=0,
                )
            ],
        )
    )
    doc.build(story)
    return buffer.getvalue()
