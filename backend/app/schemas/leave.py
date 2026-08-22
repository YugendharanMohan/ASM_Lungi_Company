from datetime import date, datetime

from pydantic import BaseModel, Field


class LeaveCreate(BaseModel):
    worker_id: int
    leave_date: date
    note: str = Field(default="", max_length=200)


class LeaveOut(LeaveCreate):
    id: int
    created_at: datetime
    worker_name: str = ""
