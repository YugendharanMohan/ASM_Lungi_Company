#!/usr/bin/env python
"""Check that this deployment is actually configured, and say what is missing.

Run it after editing .env, and again after deploying:

    ./.venv/bin/python check_setup.py

Every check reports PASS, WARN or FAIL with the exact remedy. It only reads
configuration and opens a database connection — nothing is written, so it is
safe to run against production.
"""

from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
FRONTEND_ENV = BACKEND_DIR.parent / "frontend" / ".env"

PASS, WARN, FAIL = "PASS", "WARN", "FAIL"
MARK = {PASS: "  ok  ", WARN: " warn ", FAIL: " FAIL "}


@dataclass
class Result:
    status: str
    title: str
    detail: str = ""
    fix: str = ""


results: list[Result] = []


def record(status: str, title: str, detail: str = "", fix: str = "") -> None:
    results.append(Result(status, title, detail, fix))


def read_frontend_env() -> dict[str, str]:
    """Parse frontend/.env without importing anything from the frontend."""
    if not FRONTEND_ENV.exists():
        return {}
    values: dict[str, str] = {}
    for line in FRONTEND_ENV.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip().strip("\"'")
    return values


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
def check_database(settings) -> None:
    url = settings.sqlalchemy_url

    if settings.is_sqlite:
        record(
            WARN,
            "Database: SQLite",
            f"Using a local file — {url}",
            "Fine for development. For real use set DATABASE_URL to a Postgres "
            "connection string; SQLite is a single file with no backups and "
            "does not survive a redeploy on a hosted platform.",
        )
    else:
        # Credentials are in the URL, so only the shape is echoed.
        host = url.split("@")[-1].split("/")[0] if "@" in url else "?"
        label = "Supabase" if settings.is_supabase else "Postgres"
        record(PASS, f"Database: {label}", host)

    if settings.is_supabase:
        if "db." in url and ".supabase.co" in url:
            record(
                WARN,
                "Using Supabase's direct connection",
                host,
                "Direct connections are IPv6-only on new projects, so an "
                "IPv4-only host (Render's free tier among them) cannot reach "
                "them. Prefer the pooler URLs from Project settings → Database "
                "→ Connection pooling.",
            )
        if settings.is_transaction_pooler:
            record(
                PASS,
                "Transaction pooler detected",
                "Prepared statements disabled for psycopg.",
            )
            if not settings.database_migration_url.strip():
                record(
                    WARN,
                    "No separate migration URL",
                    "DATABASE_MIGRATION_URL is unset.",
                    "Alembic needs session state and advisory locks that the "
                    "transaction pooler (port 6543) does not provide. Set "
                    "DATABASE_MIGRATION_URL to the session pooler URL (same "
                    "host, port 5432).",
                )

    try:
        from sqlalchemy import inspect, text

        from app.db.session import engine

        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        record(PASS, "Database reachable", "Connection succeeded.")
    except Exception as exc:  # noqa: BLE001
        record(
            FAIL,
            "Database unreachable",
            str(exc).splitlines()[0][:160],
            "Check DATABASE_URL. For Neon/Render, copy the connection string "
            "from the dashboard; it must include the password and, for Neon, "
            "the `?sslmode=require` suffix.",
        )
        return

    # Migrations: compare the stamped revision against the newest on disk.
    try:
        versions = sorted(
            p.stem for p in (BACKEND_DIR / "alembic" / "versions").glob("*.py")
        )
        with engine.connect() as conn:
            inspector = inspect(engine)
            if "alembic_version" not in inspector.get_table_names():
                record(
                    FAIL,
                    "Migrations not applied",
                    "No alembic_version table.",
                    "Run: ./.venv/bin/alembic upgrade head",
                )
                return
            current = conn.execute(
                text("SELECT version_num FROM alembic_version")
            ).scalar()

        heads = [v for v in versions if v.split("_")[0] == current]
        if heads:
            record(PASS, "Migrations applied", f"At revision {current}.")
        else:
            record(
                WARN,
                "Migration revision unrecognised",
                f"Database says {current}; that file is not in alembic/versions.",
                "Run: ./.venv/bin/alembic upgrade head",
            )

        tables = set(inspect(engine).get_table_names())
        expected = {
            "users",
            "sheds",
            "looms",
            "workers",
            "production_entries",
            "dispatches",
            "dispatch_items",
        }
        missing = expected - tables
        if missing:
            record(
                FAIL,
                "Tables missing",
                ", ".join(sorted(missing)),
                "Run: ./.venv/bin/alembic upgrade head",
            )
        else:
            record(PASS, "Schema complete", f"{len(expected)} tables present.")

        check_table_exposure(engine, expected)
    except Exception as exc:  # noqa: BLE001
        record(WARN, "Could not inspect schema", str(exc)[:160])


def check_table_exposure(engine, expected: set[str]) -> None:
    """On Postgres, confirm nothing is reachable through an auto REST API.

    Supabase runs PostgREST over the public schema and grants the anon role —
    whose key ships in client code — access to tables created there. This app
    never uses that path, so both RLS and the grants are checked.
    """
    from sqlalchemy import text

    if engine.dialect.name != "postgresql":
        return

    with engine.connect() as conn:
        unprotected = [
            row[0]
            for row in conn.execute(
                text(
                    "SELECT relname FROM pg_class c "
                    "JOIN pg_namespace n ON n.oid = c.relnamespace "
                    "WHERE n.nspname = 'public' AND c.relkind = 'r' "
                    "AND NOT c.relrowsecurity"
                )
            )
            if row[0] in expected
        ]

        granted = [
            f"{row[0]} → {row[1]}"
            for row in conn.execute(
                text(
                    "SELECT table_name, grantee FROM information_schema.role_table_grants "
                    "WHERE table_schema = 'public' "
                    "AND grantee IN ('anon', 'authenticated')"
                )
            )
        ]

    if unprotected:
        record(
            FAIL,
            "Tables readable via Supabase's REST API",
            "No row-level security on: " + ", ".join(sorted(unprotected)),
            "Run: ./.venv/bin/alembic upgrade head — migration 9a1c7f3d5e20 "
            "enables RLS and revokes the anon grants. Without it, worker names, "
            "phone numbers and wage rates are readable, and writable, by anyone "
            "holding the project's publishable anon key.",
        )
    elif granted:
        record(
            FAIL,
            "anon/authenticated still hold grants",
            ", ".join(granted[:4]) + ("…" if len(granted) > 4 else ""),
            "Run: ./.venv/bin/alembic upgrade head",
        )
    else:
        record(
            PASS,
            "Tables closed to the REST API",
            "RLS on, no anon/authenticated grants.",
        )


# ---------------------------------------------------------------------------
# Firebase Admin (backend)
# ---------------------------------------------------------------------------
def check_firebase_admin(settings) -> None:
    raw_json = settings.firebase_credentials_json.strip()
    cred_file = settings.firebase_credentials_file.strip()

    if not raw_json and not cred_file:
        record(
            FAIL,
            "Firebase Admin credentials missing",
            "Neither FIREBASE_CREDENTIALS_JSON nor FIREBASE_CREDENTIALS_FILE set.",
            "Firebase Console → Project settings → Service accounts → "
            "Generate new private key. Save the file outside the repo and put "
            "its path in FIREBASE_CREDENTIALS_FILE (local), or paste the whole "
            "JSON into FIREBASE_CREDENTIALS_JSON (hosted).",
        )
        return

    info: dict | None = None
    if raw_json:
        try:
            info = json.loads(raw_json)
            record(PASS, "Service account JSON parses", "")
        except json.JSONDecodeError as exc:
            record(
                FAIL,
                "FIREBASE_CREDENTIALS_JSON is not valid JSON",
                str(exc),
                "Paste the file contents on ONE line. Keep the \\n escapes in "
                "private_key exactly as they appear in the file.",
            )
            return
    else:
        path = Path(cred_file).expanduser()
        if not path.exists():
            record(
                FAIL,
                "Service account file not found",
                str(path),
                "Check the path in FIREBASE_CREDENTIALS_FILE.",
            )
            return
        try:
            info = json.loads(path.read_text())
            record(PASS, "Service account file readable", str(path))
        except (OSError, json.JSONDecodeError) as exc:
            record(FAIL, "Service account file unusable", str(exc))
            return

        # A key inside the repo will eventually be committed by someone.
        try:
            path.resolve().relative_to(BACKEND_DIR.parent.resolve())
            record(
                WARN,
                "Service account file is inside the repo",
                str(path),
                ".gitignore covers *serviceAccount*.json and "
                "firebase-adminsdk*.json, but a differently-named file would "
                "be committed. Move it outside the project directory.",
            )
        except ValueError:
            pass  # Outside the repo, which is what we want.

    if info is not None:
        if info.get("type") != "service_account":
            record(
                FAIL,
                "Wrong credential type",
                f"type is {info.get('type')!r}, expected 'service_account'.",
                "You may have downloaded the Web app config instead of a "
                "service account key. Use Project settings → Service accounts.",
            )
            return

        project = info.get("project_id", "")
        record(PASS, "Service account project", project)

        if settings.firebase_project_id and settings.firebase_project_id != project:
            record(
                FAIL,
                "FIREBASE_PROJECT_ID does not match the key",
                f"env says {settings.firebase_project_id!r}, key says {project!r}.",
                "Set FIREBASE_PROJECT_ID to the key's project_id, or remove it.",
            )

    # Actually initialise the Admin SDK — config can look right and still fail.
    try:
        from app.core import firebase

        if firebase.is_configured():
            record(PASS, "Firebase Admin initialises", "SDK ready to verify tokens.")
        else:
            record(
                FAIL,
                "Firebase Admin failed to initialise",
                "Credentials were rejected by the SDK.",
                "Re-download the service account key.",
            )
    except Exception as exc:  # noqa: BLE001
        record(FAIL, "Firebase Admin error", str(exc)[:200])


# ---------------------------------------------------------------------------
# Auth behaviour
# ---------------------------------------------------------------------------
def check_auth(settings) -> None:
    if settings.auth_dev_bypass:
        if settings.is_hosted:
            record(
                FAIL,
                "AUTH_DEV_BYPASS is on in a hosted environment",
                "The API will refuse to start.",
                "Set AUTH_DEV_BYPASS=false.",
            )
        else:
            record(
                WARN,
                "AUTH_DEV_BYPASS is on",
                "Every request is served as an admin, with no login.",
                "Set AUTH_DEV_BYPASS=false to test the real sign-in flow.",
            )
    else:
        record(PASS, "AUTH_DEV_BYPASS is off", "Real authentication enforced.")

    admins = settings.bootstrap_admin_list
    if admins:
        record(PASS, "Bootstrap admin set", ", ".join(admins))
    else:
        record(
            WARN,
            "No bootstrap admin",
            "BOOTSTRAP_ADMIN_EMAILS is empty.",
            "With no users in the database, nobody can create the first one. "
            "Set this to your own email so your first sign-in provisions an "
            "admin, then you can clear it.",
        )

    origins = settings.cors_origin_list
    if not origins:
        record(FAIL, "CORS_ORIGINS is empty", "", "The browser will block every request.")
    else:
        localhost_only = all("localhost" in o or "127.0.0.1" in o for o in origins)
        if settings.is_hosted and localhost_only:
            record(
                FAIL,
                "CORS allows only localhost",
                ", ".join(origins),
                "Add the deployed frontend URL, e.g. https://your-app.vercel.app",
            )
        else:
            record(PASS, "CORS origins", ", ".join(origins))


# ---------------------------------------------------------------------------
# Firebase Web SDK (frontend)
# ---------------------------------------------------------------------------
def check_frontend(settings) -> None:
    env = read_frontend_env()
    if not env:
        record(
            WARN,
            "frontend/.env not found",
            "",
            "Run: cp frontend/.env.example frontend/.env",
        )
        return

    required = [
        "VITE_FIREBASE_API_KEY",
        "VITE_FIREBASE_AUTH_DOMAIN",
        "VITE_FIREBASE_PROJECT_ID",
        "VITE_FIREBASE_APP_ID",
    ]
    missing = [k for k in required if not env.get(k)]
    if missing:
        record(
            WARN,
            "Frontend Firebase config incomplete",
            "Empty: " + ", ".join(missing),
            "Firebase Console → Project settings → General → Your apps → Web "
            "app → Config. With these blank the frontend runs in dev mode and "
            "shows no login screen.",
        )
        return

    record(PASS, "Frontend Firebase config present", "")

    web_project = env.get("VITE_FIREBASE_PROJECT_ID", "")
    admin_project = settings.firebase_project_id
    if not admin_project:
        try:
            source = (
                settings.firebase_credentials_json
                or Path(settings.firebase_credentials_file).read_text()
            )
            admin_project = json.loads(source).get("project_id", "")
        except Exception:  # noqa: BLE001
            admin_project = ""

    if admin_project and web_project and admin_project != web_project:
        record(
            FAIL,
            "Frontend and backend point at different Firebase projects",
            f"frontend {web_project!r} vs backend {admin_project!r}",
            "Tokens minted by one project will never verify against the other. "
            "Use the same project for both.",
        )
    elif admin_project and web_project:
        record(PASS, "Frontend and backend agree on project", web_project)


def main() -> int:
    try:
        from app.core.config import settings
    except Exception as exc:  # noqa: BLE001
        print(f"Could not load settings: {exc}")
        return 2

    print()
    print(f"  ASM Lungi Company — setup check   ({BACKEND_DIR})")
    if settings.is_hosted:
        markers = [m for m in os.environ if m in {"RENDER", "FLY_APP_NAME", "DYNO"}]
        print(f"  Hosted environment detected: {', '.join(markers) or 'yes'}")
    print()

    check_database(settings)
    check_firebase_admin(settings)
    check_auth(settings)
    check_frontend(settings)

    width = max(len(r.title) for r in results)
    for r in results:
        print(f"  [{MARK[r.status]}] {r.title.ljust(width)}  {r.detail}")
        if r.fix and r.status != PASS:
            for line in _wrap(r.fix, 74):
                print(f"           → {line}")
    print()

    failures = sum(1 for r in results if r.status == FAIL)
    warnings = sum(1 for r in results if r.status == WARN)
    if failures:
        print(f"  {failures} failure(s), {warnings} warning(s). Not ready.")
        return 1
    if warnings:
        print(f"  No failures, {warnings} warning(s). Usable; read them.")
        return 0
    print("  All checks passed.")
    return 0


def _wrap(text: str, width: int) -> list[str]:
    words, lines, line = text.split(), [], ""
    for word in words:
        if len(line) + len(word) + 1 > width:
            lines.append(line)
            line = word
        else:
            line = f"{line} {word}".strip()
    if line:
        lines.append(line)
    return lines


if __name__ == "__main__":
    sys.exit(main())
