import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import (
    dashboard,
    dispatch,
    looms,
    production,
    salary,
    sheds,
    users,
    workers,
)
from app.core import firebase
from app.core.config import settings
from app.db.session import Base, engine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    # Raises rather than warns: authentication disabled on a deployed host is
    # not something to log and carry on from.
    settings.assert_safe()

    # create_all is enough for SQLite dev. Postgres deployments run Alembic
    # (`alembic upgrade head`) so schema changes are versioned and reviewable.
    if settings.is_sqlite:
        Base.metadata.create_all(bind=engine)
        logger.info("SQLite dev database ready at %s", settings.sqlalchemy_url)

    if settings.auth_dev_bypass:
        logger.warning(
            "=" * 70
            + "\nAUTH_DEV_BYPASS=true — every request is treated as an admin."
            "\nThis must never be set in a deployed environment.\n"
            + "=" * 70
        )
    elif not firebase.is_configured():
        logger.warning(
            "Firebase Admin is not configured — all authenticated routes will "
            "return 503 until credentials are supplied."
        )

    yield


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Production, wages and dispatch tracking for a lungi mill.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api = APIRouter(prefix="/api")
api.include_router(users.router)
api.include_router(sheds.router)
api.include_router(looms.router)
api.include_router(workers.router)
api.include_router(production.router)
api.include_router(salary.router)
api.include_router(dispatch.router)
api.include_router(dashboard.router)
app.include_router(api)


@app.get("/api/health", tags=["health"])
def health() -> dict:
    """Unauthenticated liveness probe, also used by Render."""
    return {
        "status": "ok",
        "database": "sqlite" if settings.is_sqlite else "postgres",
        "firebase_configured": firebase.is_configured(),
        "auth_dev_bypass": settings.auth_dev_bypass,
    }
