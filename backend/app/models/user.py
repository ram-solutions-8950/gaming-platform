import uuid
import enum
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Enum as SAEnum, Boolean, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from ..database import Base


class UserRole(str, enum.Enum):
    USER = "USER"
    ADMIN = "ADMIN"
    SUPER_ADMIN = "SUPER_ADMIN"


class UserStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"
    DISABLED = "DISABLED"


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    username = Column(String(150), nullable=False, unique=True, index=True)
    email = Column(String(255), nullable=False)
    password_hash = Column(String(512), nullable=False)
    role = Column(SAEnum(UserRole, name="user_role"), nullable=False, default=UserRole.USER)
    status = Column(SAEnum(UserStatus, name="user_status"), nullable=False, default=UserStatus.ACTIVE)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), onupdate=lambda: datetime.now(timezone.utc))
    last_login_at = Column(DateTime(timezone=True))

    wallet = relationship("Wallet", back_populates="user", uselist=False, lazy="select")
    refresh_tokens = relationship("RefreshToken", back_populates="user", lazy="select")
    audit_logs = relationship("AuditLog", foreign_keys="AuditLog.actor_id", back_populates="actor", lazy="select")

    def __repr__(self):
        return f"<User id={self.id} username={self.username} role={self.role}>"
