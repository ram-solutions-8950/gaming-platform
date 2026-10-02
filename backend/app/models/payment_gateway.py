import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime, JSON
from sqlalchemy.dialects.postgresql import UUID
from ..database import Base


class PaymentGatewayConfig(Base):
    __tablename__ = "payment_gateway_configs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    gateway_name = Column(String(50), unique=True, nullable=False, index=True)
    display_name = Column(String(100), nullable=False)
    is_active = Column(Boolean, nullable=False, default=False)
    api_key = Column(String(255), nullable=True)
    api_secret = Column(String(512), nullable=True)
    webhook_secret = Column(String(512), nullable=True)
    is_sandbox = Column(Boolean, nullable=False, default=True)
    extra_config = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), onupdate=lambda: datetime.now(timezone.utc))

    def __repr__(self):
        return f"<PaymentGatewayConfig name={self.gateway_name} active={self.is_active}>"
