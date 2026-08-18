from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional
from ..dependencies.database import get_db
from ..schemas.wallet import WalletOut, PaginatedTransactions, WalletTransactionOut
from ..services import wallet_service
from ..security.permissions import require_user
from ..utils.responses import success_response, error_response
from ..models.user import User

router = APIRouter(prefix="/wallet", tags=["Wallet"])


@router.get("")
def get_wallet(current_user: User = Depends(require_user), db: Session = Depends(get_db)):
    wallet = wallet_service.get_balance(db, current_user.id)
    if not wallet:
        return error_response("WALLET_NOT_FOUND", "Wallet not found", status_code=404)
    return success_response({
        "id": str(wallet.id),
        "user_id": str(wallet.user_id),
        "balance": wallet.balance,
        "balance_inr": f"{wallet.balance / 100:.2f}",
    })


@router.get("/transactions")
def get_wallet_transactions(
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    tx_type: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
):
    result = wallet_service.get_transaction_history(
        db, current_user.id, page, page_size, tx_type, status
    )
    items = [WalletTransactionOut.model_validate(t).model_dump() for t in result["items"]]
    return success_response({
        "total": result["total"],
        "page": result["page"],
        "page_size": result["page_size"],
        "items": items,
    })
