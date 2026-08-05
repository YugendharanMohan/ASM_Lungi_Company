import os
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

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

    firebase_credentials_file: str = ""
    firebase_credentials_json: str = ""
    firebase_project_id: str = ""

    auth_dev_bypass: bool = False
    bootstrap_admin_emails: str = ""

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
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+psycopg://", 1)
        elif url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+psycopg://", 1)
        return url

    @property
    def is_sqlite(self) -> bool:
        return self.sqlalchemy_url.startswith("sqlite")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

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
