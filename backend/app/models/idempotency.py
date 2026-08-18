import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, JSON, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from ..database import Base


class IdempotencyKey(Base):
    __tablename__ = "idempotency_keys"
    __table_args__ = (
        UniqueConstraint("key", name="uq_idempotency_keys_key"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    key = Column(String(512), nullable=False, unique=True, index=True)
    response_status = Column(String(10))
    response_body = Column(JSON)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    expires_at = Column(DateTime(timezone=True))
