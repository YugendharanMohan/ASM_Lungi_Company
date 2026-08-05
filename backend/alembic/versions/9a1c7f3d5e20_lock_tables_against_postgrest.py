"""lock tables against PostgREST

Revision ID: 9a1c7f3d5e20
Revises: 4653ee1b782b
Create Date: 2026-08-02 09:12:00.000000

Closes Supabase's auto-generated REST API over these tables.

Supabase runs PostgREST across the ``public`` schema and grants the ``anon``
and ``authenticated`` roles access to tables created there. The ``anon`` key is
published in client code by design, so on an untouched Supabase project the
worker list — names, phone numbers, wage rates — and every production entry
would be readable, and writable, by anyone who has that key.

This app never uses Supabase's client SDK or PostgREST. It connects as
``postgres`` over the pooler and does its own authentication through Firebase,
so nothing here needs those roles at all. Both doors are shut:

  * RLS is enabled with **no policies**, which denies every row to any role
    subject to it. ``postgres`` owns these tables and bypasses RLS, so the
    application is unaffected.
  * Privileges are revoked outright, and default privileges are altered so
    tables added by later migrations start locked too.

Harmless on plain PostgreSQL: enabling RLS on tables whose owner bypasses it
changes nothing, and the role grants are skipped when the roles do not exist.
Skipped entirely on SQLite, which has neither feature.
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "9a1c7f3d5e20"
down_revision: str | None = "4653ee1b782b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLES = (
    "users",
    "sheds",
    "looms",
    "workers",
    "production_entries",
    "dispatches",
    "dispatch_items",
    "alembic_version",
)

EXPOSED_ROLES = ("anon", "authenticated")


def _is_postgres() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def upgrade() -> None:
    if not _is_postgres():
        return

    for table in TABLES:
        op.execute(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY')

    # Wrapped in a role-existence check so this runs on any PostgreSQL, not
    # only Supabase. Quoted identifiers throughout: these are fixed names, but
    # the habit is what keeps a future edit from becoming an injection.
    for role in EXPOSED_ROLES:
        op.execute(
            sa.text(
                f"""
                DO $$
                BEGIN
                    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{role}') THEN
                        REVOKE ALL ON ALL TABLES IN SCHEMA public FROM "{role}";
                        REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM "{role}";
                        REVOKE ALL ON SCHEMA public FROM "{role}";
                        ALTER DEFAULT PRIVILEGES IN SCHEMA public
                            REVOKE ALL ON TABLES FROM "{role}";
                        ALTER DEFAULT PRIVILEGES IN SCHEMA public
                            REVOKE ALL ON SEQUENCES FROM "{role}";
                    END IF;
                END
                $$;
                """
            )
        )


def downgrade() -> None:
    if not _is_postgres():
        return

    # Deliberately does NOT restore the grants to anon/authenticated. Undoing
    # this migration should not silently republish wage records to the public
    # internet; if those grants are genuinely wanted, they can be granted by
    # hand with the consequence in view.
    for table in TABLES:
        op.execute(f'ALTER TABLE "{table}" DISABLE ROW LEVEL SECURITY')
