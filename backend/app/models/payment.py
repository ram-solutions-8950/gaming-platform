import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, BigInteger, DateTime, JSON, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from ..database import Base


class PaymentConfiguration(Base):
    """Admin-managed payment provider settings. Secrets stored server-side only."""
    __tablename__ = "payment_configurations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    provider = Column(String(100), nullable=False, unique=True)
    display_name = Column(String(255), nullable=False)
    upi_id = Column(String(255))
    # Reference to a file/object in storage; not raw binary
    qr_code_reference = Column(String(500))
    minimum_deposit = Column(BigInteger, nullable=False, default=10000)   # paisa = ₹100
    maximum_deposit = Column(BigInteger, nullable=False, default=1000000) # paisa = ₹10,000
    enabled = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), onupdate=lambda: datetime.now(timezone.utc))


class PaymentEvent(Base):
    """Stores provider webhook events in an idempotent, deduplicated form."""
    __tablename__ = "payment_events"
    __table_args__ = (
        UniqueConstraint("provider", "event_id", name="uq_payment_events_provider_event_id"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    provider = Column(String(100), nullable=False, index=True)
    event_id = Column(String(255), nullable=False, index=True)
    event_type = Column(String(100), nullable=False, default="webhook")
    status = Column(String(50), nullable=False, default="RECEIVED")
    payload = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
