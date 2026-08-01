"""Printed salary receipt.

Rendered server-side so the slip a worker is handed is byte-identical whoever
prints it, rather than depending on a browser's print dialog.

Layout follows the mill's existing paper slip: worker and period at the top, a
day-by-day grid of metres per loom, per-loom totals, and the money. The one
addition is the rate breakdown — with three picks in play a single blended
figure cannot be checked by the person being paid, so each rate band is
totalled on its own line and those lines sum to the amount due.
"""

from __future__ import annotations

from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.schemas.operations import SalaryReceipt

INK = colors.HexColor("#1D1D1F")
MUTED = colors.HexColor("#6E6E73")
RULE = colors.HexColor("#C7C7CC")
BAND = colors.HexColor("#F2F2F4")

# Beyond this many looms the grid stops fitting across the page, so it is split
# into further blocks rather than shrinking the type to unreadable.
MAX_LOOM_COLUMNS = 9


def _fmt(value: float | None) -> str:
    return "—" if value is None else f"{value:.1f}"


def _money(value: float) -> str:
    return f"Rs {value:,.2f}"


def _date(value) -> str:
    return value.strftime("%d/%m")


def _grid_style() -> TableStyle:
    return TableStyle(
        [
            ("FONTNAME", (0, 0), (-1, -1), "Courier"),
            ("FONTNAME", (0, 0), (-1, 0), "Courier-Bold"),
            ("FONTNAME", (0, 1), (0, -1), "Courier-Bold"),
            ("FONTNAME", (0, -1), (-1, -1), "Courier-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("TEXTCOLOR", (0, 0), (-1, -1), INK),
            ("BACKGROUND", (0, 0), (-1, 0), BAND),
            ("BACKGROUND", (0, -1), (-1, -1), BAND),
            ("GRID", (0, 0), (-1, -1), 0.6, RULE),
            ("ALIGN", (1, 0), (-1, -1), "CENTER"),
            ("ALIGN", (0, 0), (0, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 3.2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3.2),
            ("LEFTPADDING", (0, 0), (-1, -1), 3),
            ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ]
    )


def _header(receipt: SalaryReceipt) -> Table:
    name_style = ParagraphStyle(
        "name",
        fontName="Courier-Bold",
        fontSize=15,
        leading=19,
        textColor=INK,
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


def _daily_grids(receipt: SalaryReceipt, available_width: float) -> list:
    """The date × loom grid, split into blocks that fit the page width."""
    if not receipt.loom_labels:
        return []

    flowables: list = []
    labels = receipt.loom_labels

    date_width = 22 * mm
    total_width = 22 * mm
    # Column width is fixed across blocks, from the widest block rather than
    # each block's own count. Otherwise a trailing block of two looms stretches
    # those columns across the whole page and reads as a different table.
    loom_width = (available_width - date_width - total_width) / min(
        len(labels), MAX_LOOM_COLUMNS
    )

    for offset in range(0, len(labels), MAX_LOOM_COLUMNS):
        chunk = labels[offset : offset + MAX_LOOM_COLUMNS]
        indices = list(range(offset, offset + len(chunk)))

        header = ["DATE"] + chunk + ["TOTAL"]
        body = []
        for row in receipt.rows:
            cells = [_fmt(row.cells[i].meters) for i in indices]
            block_total = sum(
                row.cells[i].meters or 0.0
                for i in indices
            )
            body.append([_date(row.entry_date), *cells, f"{block_total:.1f}"])

        totals_row = ["TOTAL"] + [
            _fmt(receipt.loom_totals[i].meters) for i in indices
        ]
        totals_row.append(
            f"{sum(receipt.loom_totals[i].meters or 0.0 for i in indices):.1f}"
        )

        table = Table(
            [header, *body, totals_row],
            colWidths=[date_width, *([loom_width] * len(chunk)), total_width],
            repeatRows=1,
        )
        table.setStyle(_grid_style())
        flowables.append(table)
        flowables.append(Spacer(1, 5 * mm))

    return flowables


def _loom_totals_table(receipt: SalaryReceipt) -> Table:
    rows = [["LOOM", "TOTAL METERS"]]
    rows += [
        [cell.loom_label, f"{cell.meters or 0:.1f}"]
        for cell in receipt.loom_totals
    ]
    table = Table(rows, colWidths=[34 * mm, 34 * mm])
    table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), "Courier"),
                ("FONTNAME", (0, 0), (-1, 0), "Courier-Bold"),
                ("FONTNAME", (0, 1), (0, -1), "Courier-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("TEXTCOLOR", (0, 0), (-1, -1), INK),
                ("BACKGROUND", (0, 0), (-1, 0), BAND),
                ("GRID", (0, 0), (-1, -1), 0.6, RULE),
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("TOPPADDING", (0, 0), (-1, -1), 3.8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3.8),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return table


def _rate_table(receipt: SalaryReceipt) -> Table:
    """Metres grouped by piece rate — the part that has to add up by hand."""
    rows = [["PICK", "RATE", "METERS", "AMOUNT"]]
    for group in receipt.rate_groups:
        rows.append(
            [
                ", ".join(group.pick_types),
                f"{group.rate:.2f}",
                f"{group.meters:.1f}",
                f"{group.amount:,.2f}",
            ]
        )
    rows.append(
        [
            "TOTAL",
            "",
            f"{receipt.total_meters:.1f}",
            f"{receipt.total_amount:,.2f}",
        ]
    )

    table = Table(rows, colWidths=[30 * mm, 20 * mm, 24 * mm, 30 * mm])
    table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), "Courier"),
                ("FONTNAME", (0, 0), (-1, 0), "Courier-Bold"),
                ("FONTNAME", (0, -1), (-1, -1), "Courier-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("TEXTCOLOR", (0, 0), (-1, -1), INK),
                ("BACKGROUND", (0, 0), (-1, 0), BAND),
                ("BACKGROUND", (0, -1), (-1, -1), BAND),
                ("GRID", (0, 0), (-1, -1), 0.6, RULE),
                ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
                ("TOPPADDING", (0, 0), (-1, -1), 3.8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3.8),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return table


def _summary(receipt: SalaryReceipt) -> Table:
    label = ParagraphStyle(
        "sum-label", fontName="Courier", fontSize=10, textColor=MUTED
    )
    value = ParagraphStyle(
        "sum-value",
        fontName="Courier-Bold",
        fontSize=11,
        textColor=INK,
        alignment=TA_RIGHT,
    )
    pay_label = ParagraphStyle(
        "pay-label", fontName="Courier-Bold", fontSize=13, textColor=INK
    )
    pay_value = ParagraphStyle(
        "pay-value",
        fontName="Courier-Bold",
        fontSize=15,
        textColor=INK,
        alignment=TA_RIGHT,
    )

    rows = [
        [
            Paragraph("TOTAL METERS", label),
            Paragraph(f"{receipt.total_meters:.2f}", value),
        ],
        [
            Paragraph("AVG RATE", label),
            Paragraph(f"Rs {receipt.average_rate:.2f}", value),
        ],
        [Paragraph("TOTAL PAY", pay_label), Paragraph(_money(receipt.total_amount), pay_value)],
    ]

    table = Table(rows, colWidths=[40 * mm, 45 * mm])
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("BACKGROUND", (0, 2), (-1, 2), BAND),
                ("BOX", (0, 2), (-1, 2), 1.1, INK),
                ("LINEBELOW", (0, 0), (-1, 1), 0.6, RULE),
            ]
        )
    )
    return table


def render_receipt_pdf(receipt: SalaryReceipt) -> bytes:
    buffer = BytesIO()
    page_width, page_height = landscape(A4)
    # 12mm clears every common printer's unprintable edge while leaving a
    # fortnight's grid plus the totals on a single sheet — measured, not
    # guessed: at 14mm the summary block overflowed by under a millimetre.
    margin = 12 * mm

    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        leftMargin=margin,
        rightMargin=margin,
        topMargin=margin,
        bottomMargin=margin,
        title=f"Salary receipt — {receipt.worker_name}",
        author="ASM Lungi Works",
    )
    available = page_width - 2 * margin

    story: list = [_header(receipt), Spacer(1, 5 * mm)]

    if not receipt.rows:
        story.append(
            Paragraph(
                "No production recorded for this period.",
                ParagraphStyle(
                    "empty", fontName="Courier", fontSize=10, textColor=MUTED
                ),
            )
        )
    else:
        story.extend(_daily_grids(receipt, available))

        # Loom totals, rate breakdown and the money sit side by side rather
        # than stacked. The page is landscape and the grid above leaves a wide
        # empty band; stacking them cost ~25mm of height and tipped a two-week
        # receipt onto a second sheet.
        lower = Table(
            [
                [
                    _loom_totals_table(receipt),
                    "",
                    _rate_table(receipt),
                    "",
                    _summary(receipt),
                ]
            ],
            colWidths=[68 * mm, 6 * mm, 104 * mm, 6 * mm, 85 * mm],
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
        # Deliberately not wrapped in KeepTogether: it measures conservatively
        # and pushed the block to a second page even when the content fit with
        # millimetres to spare. Long periods may split the grid, which is
        # correct — it repeats its header row on the next page.
        story.append(lower)

    doc.build(story)
    return buffer.getvalue()
