from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from uuid import UUID
from ..dependencies.database import get_db
from ..schemas.wallet import WalletTransactionOut
from ..models.transaction import WalletTransaction
from ..security.permissions import require_user
from ..utils.responses import success_response, error_response
from ..models.user import User, UserRole

router = APIRouter(prefix="/transactions", tags=["Transactions"])


@router.get("")
def list_transactions(
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    tx_type: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
):
    query = db.query(WalletTransaction)
    if current_user.role == UserRole.USER:
        query = query.filter(WalletTransaction.user_id == current_user.id)
    if tx_type:
        query = query.filter(WalletTransaction.type == tx_type)
    if status:
        query = query.filter(WalletTransaction.status == status)
    total = query.count()
    items = query.order_by(WalletTransaction.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return success_response({
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [WalletTransactionOut.model_validate(t).model_dump() for t in items],
    })


@router.get("/{tx_id}")
def get_transaction(tx_id: UUID, current_user: User = Depends(require_user), db: Session = Depends(get_db)):
    tx = db.query(WalletTransaction).filter(WalletTransaction.id == tx_id).first()
    if not tx:
        return error_response("NOT_FOUND", "Transaction not found", status_code=404)
    if current_user.role == UserRole.USER and tx.user_id != current_user.id:
        return error_response("FORBIDDEN", "Access denied", status_code=403)
    return success_response(WalletTransactionOut.model_validate(tx).model_dump())
