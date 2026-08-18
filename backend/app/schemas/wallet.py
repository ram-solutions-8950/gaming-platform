from typing import Optional, List
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel
from ..models.transaction import WalletTransactionType, WalletTransactionStatus


class WalletOut(BaseModel):
    id: UUID
    user_id: UUID
    balance: int          # paisa
    balance_inr: str      # human-readable
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class WalletTransactionOut(BaseModel):
    id: UUID
    type: WalletTransactionType
    amount: int
    balance_before: int
    balance_after: int
    reference_type: Optional[str] = None
    reference_id: Optional[str] = None
    status: WalletTransactionStatus
    created_at: datetime

    model_config = {"from_attributes": True}


class PaginatedTransactions(BaseModel):
    total: int
    page: int
    page_size: int
    items: List[WalletTransactionOut]
