from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session
from uuid import UUID
from typing import Optional
from ..dependencies.database import get_db
from ..schemas.user import UserOut, AdminUserStatusUpdateIn
from ..schemas.deposit import DepositOut
from ..schemas.withdrawal import WithdrawalOut
from ..schemas.wallet import WalletTransactionOut
from ..schemas.payment import PaymentConfigOut, PaymentConfigUpdateIn
from ..models.user import User, UserRole, UserStatus
from ..models.deposit import Deposit
from ..models.withdrawal import Withdrawal
from ..models.transaction import WalletTransaction
from ..models.payment import PaymentConfiguration
from ..services import wallet_service, audit_service
from ..models.transaction import WalletTransactionType
from ..security.permissions import require_admin, require_super_admin
from ..utils.responses import success_response, error_response
from ..middleware.rate_limiter import limiter

router = APIRouter(prefix="/admin", tags=["Admin"])


# -- Users ----------------------------------------------------------------------
@router.get("/users")
@limiter.limit("30/minute")
def list_users(
    request: Request,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    status: Optional[str] = Query(default=None),
    role: Optional[str] = Query(default=None),
):
    query = db.query(User)
    if status:
        query = query.filter(User.status == status)
    if role:
        query = query.filter(User.role == role)
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    return success_response({
        "total": total, "page": page, "page_size": page_size,
        "items": [UserOut.model_validate(u).model_dump() for u in items],
    })


@router.get("/users/{user_id}")
def get_user(user_id: UUID, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return error_response("NOT_FOUND", "User not found", status_code=404)
    return success_response(UserOut.model_validate(user).model_dump())


@router.patch("/users/{user_id}/status")
def update_user_status(
    user_id: UUID,
    data: AdminUserStatusUpdateIn,
    admin: User = Depends(require_super_admin),   # Only SUPER_ADMIN can change user status
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return error_response("NOT_FOUND", "User not found", status_code=404)
    old_status = user.status
    user.status = data.status
    audit_service.log_action(
        db, action="USER_STATUS_CHANGE", actor_id=admin.id,
        entity_type="user", entity_id=user_id,
        metadata={"old": old_status.value, "new": data.status.value, "reason": data.reason},
    )
    db.commit()
    return success_response(UserOut.model_validate(user).model_dump())


# -- Transactions ---------------------------------------------------------------
@router.get("/transactions")
def list_all_transactions(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    total = db.query(WalletTransaction).count()
    items = db.query(WalletTransaction).order_by(WalletTransaction.created_at.desc()).offset((page-1)*page_size).limit(page_size).all()
    return success_response({
        "total": total, "page": page, "page_size": page_size,
        "items": [WalletTransactionOut.model_validate(t).model_dump() for t in items],
    })


# -- Deposits -------------------------------------------------------------------
@router.get("/deposits")
def list_all_deposits(admin: User = Depends(require_admin), db: Session = Depends(get_db), page: int = 1, page_size: int = 20):
    total = db.query(Deposit).count()
    items = db.query(Deposit).order_by(Deposit.created_at.desc()).offset((page-1)*page_size).limit(page_size).all()
    return success_response({
        "total": total, "page": page, "page_size": page_size,
        "items": [DepositOut.model_validate(d).model_dump() for d in items],
    })


# -- Withdrawals ----------------------------------------------------------------
@router.get("/withdrawals")
def list_all_withdrawals(admin: User = Depends(require_admin), db: Session = Depends(get_db), page: int = 1, page_size: int = 20):
    total = db.query(Withdrawal).count()
    items = db.query(Withdrawal).order_by(Withdrawal.created_at.desc()).offset((page-1)*page_size).limit(page_size).all()
    return success_response({
        "total": total, "page": page, "page_size": page_size,
        "items": [WithdrawalOut.model_validate(w).model_dump() for w in items],
    })


# -- Payment Settings -----------------------------------------------------------
@router.get("/payment-settings")
@limiter.limit("30/minute")
def get_payment_settings(request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    configs = db.query(PaymentConfiguration).all()
    return success_response([PaymentConfigOut.model_validate(c).model_dump() for c in configs])


@router.patch("/payment-settings/{config_id}")
def update_payment_settings(
    config_id: UUID,
    data: PaymentConfigUpdateIn,
    admin: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    config = db.query(PaymentConfiguration).filter(PaymentConfiguration.id == config_id).first()
    if not config:
        return error_response("NOT_FOUND", "Configuration not found", status_code=404)
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(config, field, value)
    audit_service.log_action(db, action="PAYMENT_CONFIG_CHANGE", actor_id=admin.id,
                             entity_type="payment_configuration", entity_id=config_id,
                             metadata=data.model_dump(exclude_none=True))
    db.commit()
    return success_response(PaymentConfigOut.model_validate(config).model_dump())


# -- Wallet Adjustments ---------------------------------------------------------
@router.post("/wallet-adjustments")
def wallet_adjustment(
    user_id: UUID,
    amount: int,
    reason: str,
    admin: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    if not reason or len(reason.strip()) < 5:
        return error_response("INVALID_REASON", "Reason must be at least 5 characters")
    try:
        if amount >= 0:
            tx = wallet_service.credit_wallet(
                db, user_id, abs(amount), WalletTransactionType.ADJUSTMENT,
                reference_type="admin_adjustment", reference_id=f"adj_{admin.id}_{user_id}_{amount}",
                metadata={"reason": reason, "admin_id": str(admin.id)},
            )
        else:
            tx = wallet_service.debit_wallet(
                db, user_id, abs(amount), WalletTransactionType.ADJUSTMENT,
                reference_type="admin_adjustment", reference_id=f"adj_{admin.id}_{user_id}_{amount}",
                metadata={"reason": reason, "admin_id": str(admin.id)},
            )
        audit_service.log_action(
            db, action="WALLET_ADJUSTMENT", actor_id=admin.id,
            entity_type="wallet", entity_id=user_id,
            metadata={"amount": amount, "reason": reason, "tx_id": str(tx.id)},
        )
        db.commit()
        return success_response(WalletTransactionOut.model_validate(tx).model_dump())
    except ValueError as e:
        return error_response("ADJUSTMENT_ERROR", str(e))
