from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings


class Base(DeclarativeBase):
    pass


def _connect_args() -> dict:
    # SQLite needs check_same_thread off because FastAPI serves requests from a
    # threadpool.
    if settings.is_sqlite:
        return {"check_same_thread": False}

    if settings.is_transaction_pooler:
        # psycopg3 promotes a query to a server-side prepared statement after
        # five executions. Behind a transaction-mode pooler each execution can
        # land on a different backend, so the PREPARE and the EXECUTE end up on
        # different connections and every repeated query starts failing with
        # "prepared statement ... already exists". It only appears once a query
        # has run a handful of times, which means it surfaces in production
        # rather than in a smoke test. None disables preparing entirely.
        return {"prepare_threshold": None}

    return {}


# pool_pre_ping so a connection dropped during an idle period surfaces as a
# reconnect rather than an error on the first query after the lull — both
# Supabase and Render recycle idle connections aggressively.
engine = create_engine(
    settings.sqlalchemy_url,
    connect_args=_connect_args(),
    pool_pre_ping=not settings.is_sqlite,
    # Supabase's free tier allows relatively few direct connections; a large
    # idle pool can exhaust them across restarts and parallel workers.
    **({} if settings.is_sqlite else {"pool_size": 5, "max_overflow": 5}),
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
