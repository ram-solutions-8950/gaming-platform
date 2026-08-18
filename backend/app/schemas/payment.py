from typing import Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, field_validator, model_validator


class PaymentConfigCreateIn(BaseModel):
    """Schema for creating a new payment configuration."""
    provider: str
    display_name: str
    upi_id: Optional[str] = None
    qr_code_reference: Optional[str] = None
    minimum_deposit: int   # paisa
    maximum_deposit: int   # paisa
    deposit_instructions: Optional[str] = None
    enabled: bool = False

    @field_validator("provider")
    @classmethod
    def provider_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v or len(v) > 100:
            raise ValueError("Provider must be 1-100 characters")
        return v

    @field_validator("display_name")
    @classmethod
    def display_name_valid(cls, v: str) -> str:
        v = v.strip()
        if not v or len(v) > 255:
            raise ValueError("Display name must be 1-255 characters")
        return v

    @field_validator("upi_id")
    @classmethod
    def upi_id_valid(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip()
            if len(v) > 255:
                raise ValueError("UPI ID must be 255 characters or fewer")
            if v == "":
                return None
        return v

    @field_validator("deposit_instructions")
    @classmethod
    def instructions_valid(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and len(v) > 5000:
            raise ValueError("Deposit instructions must be 5000 characters or fewer")
        return v

    @field_validator("minimum_deposit")
    @classmethod
    def min_deposit_positive(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("Minimum deposit must be greater than 0")
        return v

    @model_validator(mode="after")
    def max_gte_min(self):
        if self.maximum_deposit < self.minimum_deposit:
            raise ValueError("Maximum deposit must be >= minimum deposit")
        return self

    @model_validator(mode="after")
    def upi_required_when_enabled(self):
        if self.enabled and not self.upi_id:
            raise ValueError("UPI ID is required when configuration is enabled")
        return self


class PaymentConfigUpdateIn(BaseModel):
    """Schema for partial update of payment configuration."""
    upi_id: Optional[str] = None
    qr_code_reference: Optional[str] = None
    minimum_deposit: Optional[int] = None
    maximum_deposit: Optional[int] = None
    enabled: Optional[bool] = None
    display_name: Optional[str] = None
    deposit_instructions: Optional[str] = None

    @field_validator("display_name")
    @classmethod
    def display_name_valid(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip()
            if not v or len(v) > 255:
                raise ValueError("Display name must be 1-255 characters")
        return v

    @field_validator("upi_id")
    @classmethod
    def upi_id_valid(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip()
            if len(v) > 255:
                raise ValueError("UPI ID must be 255 characters or fewer")
        return v

    @field_validator("deposit_instructions")
    @classmethod
    def instructions_valid(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and len(v) > 5000:
            raise ValueError("Deposit instructions must be 5000 characters or fewer")
        return v

    @field_validator("minimum_deposit")
    @classmethod
    def min_deposit_positive(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v <= 0:
            raise ValueError("Minimum deposit must be greater than 0")
        return v


class PaymentConfigOut(BaseModel):
    """Safe subset of PaymentConfiguration - no secrets."""
    id: UUID
    provider: str
    display_name: str
    upi_id: Optional[str] = None
    qr_code_reference: Optional[str] = None
    minimum_deposit: int
    maximum_deposit: int
    deposit_instructions: Optional[str] = None
    enabled: bool

    model_config = {"from_attributes": True}


class ActivePaymentConfigOut(BaseModel):
    """Public-facing payment configuration for users. No secrets, no internal IDs."""
    display_name: str
    upi_id: str
    qr_code_url: Optional[str] = None
    minimum_deposit: int
    maximum_deposit: int
    deposit_instructions: Optional[str] = None

    model_config = {"from_attributes": True}
