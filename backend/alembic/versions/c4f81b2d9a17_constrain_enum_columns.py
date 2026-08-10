"""constrain enum columns

Revision ID: c4f81b2d9a17
Revises: 9a1c7f3d5e20
Create Date: 2026-08-11 10:20:00.000000

Stop the database accepting values the application cannot read back.

These columns are declared as SQLAlchemy enums with ``native_enum=False``,
which stores them as VARCHAR. SQLAlchemy does not add a CHECK constraint for
that unless asked, so the column will hold any string at all — while loading a
row whose value is not a member raises ``LookupError`` and the endpoint returns
500.

That is not hypothetical: a ``users`` row edited by hand in the Supabase table
editor was given the role ``Admin`` instead of ``ADMIN``. Every request that
read the full user list failed, and so did every sign-in by that account, since
the lookup loads the same row. A malformed value is worth rejecting at write
time, where the mistake is visible, rather than at read time in an unrelated
request.

Existing values are normalised to upper case first, so the constraints can be
added without a manual clean-up step.

PostgreSQL only. SQLite has no ALTER TABLE ADD CONSTRAINT, and rebuilding four
tables in development to gain a check the application already enforces is not
worth it.
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "c4f81b2d9a17"
down_revision: str | None = "9a1c7f3d5e20"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# table, column, constraint name, allowed values
ENUM_COLUMNS = (
    ("users", "role", "ck_users_role", ("ADMIN", "STAFF")),
    ("production_entries", "shift", "ck_production_shift", ("DAY", "NIGHT")),
    (
        "production_entries",
        "pick_type",
        "ck_production_pick_type",
        ("P88X96", "P88X92", "P88X80"),
    ),
    (
        "dispatch_items",
        "pick_type",
        "ck_dispatch_item_pick_type",
        ("P88X96", "P88X92", "P88X80", "P88X96_KAMBAM"),
    ),
)


def upgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return

    for table, column, name, allowed in ENUM_COLUMNS:
        # Repair case-only mistakes before constraining, so the migration does
        # not fail on data the operator can no longer see the shape of.
        values = ", ".join(f"'{v}'" for v in allowed)
        op.execute(
            sa.text(
                f'UPDATE "{table}" SET "{column}" = UPPER("{column}") '
                f'WHERE UPPER("{column}") IN ({values}) '
                f'AND "{column}" <> UPPER("{column}")'
            )
        )
        op.create_check_constraint(name, table, f'"{column}" IN ({values})')


def downgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return

    for table, _column, name, _allowed in ENUM_COLUMNS:
        op.drop_constraint(name, table, type_="check")
