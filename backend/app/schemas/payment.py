from typing import Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel


class PaymentConfigOut(BaseModel):
    """Safe subset of PaymentConfiguration - no secrets."""
    id: UUID
    provider: str
    display_name: str
    upi_id: Optional[str] = None
    qr_code_reference: Optional[str] = None
    minimum_deposit: int
    maximum_deposit: int
    enabled: bool

    model_config = {"from_attributes": True}


class PaymentConfigUpdateIn(BaseModel):
    upi_id: Optional[str] = None
    qr_code_reference: Optional[str] = None
    minimum_deposit: Optional[int] = None
    maximum_deposit: Optional[int] = None
    enabled: Optional[bool] = None
    display_name: Optional[str] = None
