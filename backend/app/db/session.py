from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings


class Base(DeclarativeBase):
    pass


# SQLite needs check_same_thread off because FastAPI serves requests from a
# threadpool; Postgres wants a pre-ping so Render's idle connection recycling
# does not surface as a dead-connection error on the first query after a lull.
engine = create_engine(
    settings.sqlalchemy_url,
    connect_args={"check_same_thread": False} if settings.is_sqlite else {},
    pool_pre_ping=not settings.is_sqlite,
)

if settings.is_sqlite:

    @event.listens_for(engine, "connect")
    def _enable_sqlite_foreign_keys(dbapi_connection, _record):
        """SQLite ignores FK constraints unless asked, per connection.

        Without this, ON DELETE CASCADE / SET NULL are silently no-ops in dev
        and the local database diverges from Postgres behaviour.
        """
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
