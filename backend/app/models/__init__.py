"""SQLAlchemy models.

Imported for their side effect of registering tables on ``Base.metadata`` —
Alembic autogenerate and ``create_all`` both rely on every model being loaded.
"""

from app.models.dispatch import Dispatch
from app.models.loom import Loom
from app.models.production import ProductionEntry, Shift
from app.models.shed import Shed
from app.models.user import User, UserRole
from app.models.worker import Worker

__all__ = [
    "Dispatch",
    "Loom",
    "ProductionEntry",
    "Shed",
    "Shift",
    "User",
    "UserRole",
    "Worker",
]
