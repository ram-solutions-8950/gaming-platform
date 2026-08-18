from typing import Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel
from ..models.user import UserRole, UserStatus


class UserOut(BaseModel):
    id: UUID
    name: str
    username: str
    email: str
    role: UserRole
    status: UserStatus
    created_at: datetime
    last_login_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class UserUpdateIn(BaseModel):
    name: Optional[str] = None
    username: Optional[str] = None


class AdminUserStatusUpdateIn(BaseModel):
    status: UserStatus
    reason: Optional[str] = None
