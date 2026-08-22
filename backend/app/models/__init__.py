"""SQLAlchemy models.

Imported for their side effect of registering tables on ``Base.metadata`` —
Alembic autogenerate and ``create_all`` both rely on every model being loaded.
"""

from app.models.dispatch import (
    LUNGIS_PER_BUNDLE,
    Dispatch,
    DispatchItem,
    DispatchPick,
)
from app.models.leave import WorkerLeave
from app.models.loom import Loom
from app.models.production import PickType, ProductionEntry, Shift
from app.models.shed import Shed
from app.models.user import User, UserRole
from app.models.worker import Worker

__all__ = [
    "LUNGIS_PER_BUNDLE",
    "Dispatch",
    "DispatchItem",
    "DispatchPick",
    "Loom",
    "WorkerLeave",
    "PickType",
    "ProductionEntry",
    "Shed",
    "Shift",
    "User",
    "UserRole",
    "Worker",
]
