"""dispatch bundles by pick

Revision ID: 4653ee1b782b
Revises: be63c4a0cbd5
Create Date: 2026-08-02 06:41:38.909078

Consignments are now recorded as bundles of a given pick rather than a loose
piece count, since that is how they are tied and counted onto the lorry.

Existing rows are carried over onto a single 88x96 line. A loose count is not
necessarily a whole number of bundles, so it is rounded to the nearest bundle
and ``quantity`` is rewritten to match — after this migration every dispatch
total is a multiple of 24. Rows that round to zero bundles keep a zero total
rather than being deleted; the consignment still happened.
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "4653ee1b782b"
down_revision: str | None = "be63c4a0cbd5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

LUNGIS_PER_BUNDLE = 24


def upgrade() -> None:
    op.create_table(
        "dispatch_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("dispatch_id", sa.Integer(), nullable=False),
        sa.Column(
            "pick_type",
            sa.Enum(
                "P88X96",
                "P88X92",
                "P88X80",
                "P88X96_KAMBAM",
                name="dispatchpick",
                native_enum=False,
                length=16,
            ),
            nullable=False,
        ),
        sa.Column("bundles", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["dispatch_id"], ["dispatches.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("dispatch_id", "pick_type", name="uq_dispatch_pick"),
    )
    with op.batch_alter_table("dispatch_items", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_dispatch_items_dispatch_id"),
            ["dispatch_id"],
            unique=False,
        )

    # Carry existing consignments onto a single line. Integer arithmetic
    # throughout so PostgreSQL and SQLite round identically:
    # (q + 12) / 24 is round-half-up in integer division.
    op.execute(
        sa.text(
            f"""
            INSERT INTO dispatch_items (dispatch_id, pick_type, bundles)
            SELECT id, 'P88X96',
                   (quantity + {LUNGIS_PER_BUNDLE // 2}) / {LUNGIS_PER_BUNDLE}
            FROM dispatches
            """
        )
    )
    op.execute(
        sa.text(
            f"""
            UPDATE dispatches
            SET quantity = (
                SELECT COALESCE(SUM(bundles), 0) * {LUNGIS_PER_BUNDLE}
                FROM dispatch_items
                WHERE dispatch_items.dispatch_id = dispatches.id
            )
            """
        )
    )


def downgrade() -> None:
    # quantity already holds the piece total, so dropping the lines loses the
    # per-pick split but leaves the consignment totals intact.
    with op.batch_alter_table("dispatch_items", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_dispatch_items_dispatch_id"))

    op.drop_table("dispatch_items")
