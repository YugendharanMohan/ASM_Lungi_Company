from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


# --------------------------------------------------------------------------
# Shed
# --------------------------------------------------------------------------
class ShedBase(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    location: str = Field(default="", max_length=160)


class ShedCreate(ShedBase):
    pass


class ShedUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    location: str | None = Field(default=None, max_length=160)


class ShedOut(ShedBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    loom_count: int = 0


# --------------------------------------------------------------------------
# Loom
# --------------------------------------------------------------------------
class LoomBase(BaseModel):
    loom_number: str = Field(min_length=1, max_length=40)
    shed_id: int
    is_active: bool = True


class LoomCreate(LoomBase):
    pass


class LoomUpdate(BaseModel):
    loom_number: str | None = Field(default=None, min_length=1, max_length=40)
    shed_id: int | None = None
    is_active: bool | None = None


class LoomOut(LoomBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    shed_name: str = ""
    # "AA - 3" — how a loom is named everywhere it is shown to a person.
    label: str = ""


# --------------------------------------------------------------------------
# Worker
# --------------------------------------------------------------------------
class WorkerBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    phone: str = Field(default="", max_length=20)
    shed_id: int | None = None
    rate_per_meter: float = Field(default=0, ge=0)
    is_active: bool = True


class WorkerCreate(WorkerBase):
    pass


class WorkerUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    phone: str | None = Field(default=None, max_length=20)
    shed_id: int | None = None
    rate_per_meter: float | None = Field(default=None, ge=0)
    is_active: bool | None = None


class WorkerOut(WorkerBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    shed_name: str = ""
