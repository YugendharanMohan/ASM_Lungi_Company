import logging
import os
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

BACKEND_DIR = Path(__file__).resolve().parents[2]

# Environment variables set by hosting platforms, not by us. Their presence
# means the process is deployed, whatever the config file claims.
HOSTED_MARKERS = ("RENDER", "FLY_APP_NAME", "DYNO", "K_SERVICE", "WEBSITE_INSTANCE_ID")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "ASM Lungi Works API"
    database_url: str = ""
    #: Optional separate URL for Alembic. Supabase's transaction pooler cannot
    #: run migrations reliably (no session state, no advisory locks), so point
    #: this at the session pooler while the app itself uses the transaction
    #: pooler. Falls back to database_url when unset.
    database_migration_url: str = ""

    firebase_credentials_file: str = ""
    firebase_credentials_json: str = ""
    firebase_project_id: str = ""

    auth_dev_bypass: bool = False
    bootstrap_admin_emails: str = ""

    #: How often to ask Firebase whether a token has been revoked, per user.
    #: Doing it on every request costs a round-trip to Google — measured at
    #: ~600ms, which was the single largest component of request latency.
    #: Deactivating someone in *this* app still takes effect immediately; this
    #: only delays noticing a revocation made on the Firebase side.
    auth_revocation_check_seconds: int = 300

    #: How stale ``last_login_at`` may get before it is rewritten. It is a
    #: "last seen" marker, so minute precision is ample, and writing it on
    #: every request cost an UPDATE plus COMMIT round-trip each time.
    last_seen_refresh_seconds: int = 300

    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def sqlalchemy_url(self) -> str:
        """Normalise the configured URL, falling back to a local SQLite file.

        Render hands out `postgres://...`, which SQLAlchemy 2 no longer accepts,
        and a bare `postgresql://` picks the psycopg2 driver we do not install.
        Both are rewritten onto psycopg v3 here so the deploy config can be
        copy-pasted from the Render dashboard without editing.
        """
        url = self.database_url.strip()
        if not url:
            return f"sqlite:///{BACKEND_DIR / 'asm_dev.db'}"
        return self._normalise(url)

    def _normalise(self, url: str) -> str:
        url = url.strip()
        if url.startswith("postgres://"):
            return url.replace("postgres://", "postgresql+psycopg://", 1)
        if url.startswith("postgresql://"):
            return url.replace("postgresql://", "postgresql+psycopg://", 1)
        return url

    @property
    def migration_url(self) -> str:
        """URL Alembic should use — the session pooler on Supabase."""
        explicit = self._normalise(self.database_migration_url)
        return explicit or self.sqlalchemy_url

    @property
    def is_sqlite(self) -> bool:
        return self.sqlalchemy_url.startswith("sqlite")

    @property
    def is_transaction_pooler(self) -> bool:
        """True for a PgBouncer-style transaction-mode pooler.

        Port 6543 is Supabase's convention for it. Transaction mode hands out a
        different backend per statement, so server-side prepared statements —
        which psycopg3 starts using automatically after a few repeats of the
        same query — fail with "prepared statement already exists" once traffic
        picks up. Detected here so the driver can be told not to prepare.
        """
        return ":6543" in self.sqlalchemy_url

    @property
    def is_supabase(self) -> bool:
        return "supabase" in self.sqlalchemy_url

    @property
    def cors_origin_list(self) -> list[str]:
        """Allowed browser origins, normalised.

        A browser sends a full origin — scheme, host and port — and the
        comparison is an exact string match. So "example.com" or a trailing
        slash matches nothing, and the failure is invisible from the server
        side: the request simply arrives and is refused, and the browser
        reports it to the user as the network being down. Both mistakes are
        repaired here, loudly, rather than being left to look like an outage.
        """
        origins: list[str] = []
        for raw in self.cors_origins.split(","):
            origin = raw.strip().rstrip("/")
            if not origin:
                continue
            if "://" not in origin:
                logger.warning(
                    "CORS_ORIGINS entry %r has no scheme; assuming https://. "
                    "Set the full origin to silence this.",
                    origin,
                )
                origin = f"https://{origin}"
            origins.append(origin)
        return origins

    @property
    def bootstrap_admin_list(self) -> list[str]:
        return [
            e.strip().lower()
            for e in self.bootstrap_admin_emails.split(",")
            if e.strip()
        ]

    @property
    def is_hosted(self) -> bool:
        """True when a hosting platform's own env vars are present."""
        return any(os.environ.get(marker) for marker in HOSTED_MARKERS)

    def assert_safe(self) -> None:
        """Refuse to run with authentication disabled on a deployed host.

        A warning in the log is not enough protection for wage records: nobody
        reads startup logs, and the failure is silent and total — every route
        served as admin to anyone who finds the URL. Better to not boot.
        """
        if self.auth_dev_bypass and self.is_hosted:
            raise RuntimeError(
                "AUTH_DEV_BYPASS=true on a hosted environment. This disables "
                "authentication entirely. Set AUTH_DEV_BYPASS=false and supply "
                "Firebase credentials."
            )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
