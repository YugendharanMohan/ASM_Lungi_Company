from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.user import UserRole


class UserCreate(BaseModel):
    """Admin-side user creation.

    No password field: credentials live in Firebase. Creating a row here
    authorises an email; the admin separately invites it in the Firebase
    console (or the account is created there and linked on first login).
    """

    email: EmailStr
    display_name: str = Field(default="", max_length=120)
    role: UserRole = UserRole.STAFF
    is_active: bool = True


class UserUpdate(BaseModel):
    display_name: str | None = Field(default=None, max_length=120)
    role: UserRole | None = None
    is_active: bool | None = None


class UserOut(BaseModel):
    """Read model.

    ``email`` is a plain str, not EmailStr: this is data already stored, and
    re-validating it on the way out turns a merely unusual address into a 500
    on a read endpoint. Validation belongs on input (see UserCreate).
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    display_name: str = ""
    role: UserRole
    is_active: bool
    firebase_uid: str | None = None
    created_at: datetime
    last_login_at: datetime | None = None
