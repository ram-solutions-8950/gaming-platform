from fastapi import APIRouter, Depends
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from uuid import UUID

from ..config import settings
from ..dependencies.database import get_db
from ..schemas.deposit import (
    DepositCreateIn,
    DepositOut,
    ManualDepositCreateIn,
    DepositVerifyIn,
)
from ..services import deposit_service
from ..security.permissions import require_user
from ..utils.responses import success_response, error_response
from ..models.user import User
from ..models.deposit import Deposit, DepositStatus
from ..models.payment import PaymentConfiguration
from ..models.wallet import Wallet

router = APIRouter(prefix="/deposits", tags=["Deposits"])


from ..services.payment_service import get_active_gateway_config

@router.get("/config")
def get_deposit_config(db: Session = Depends(get_db)):
    """Return gateway and enabled manual UPI configuration for deposit UI."""
    manual_configs = db.query(PaymentConfiguration).filter(
        PaymentConfiguration.enabled.is_(True)
    ).order_by(PaymentConfiguration.created_at.asc()).all()
    if not manual_configs:
        manual_configs = db.query(PaymentConfiguration).filter(
            PaymentConfiguration.upi_id.isnot(None),
            PaymentConfiguration.upi_id != "",
        ).order_by(PaymentConfiguration.created_at.asc()).all()
    manual_items = [
        {
            "id": str(config.id),
            "display_name": config.display_name,
            "upi_id": config.upi_id,
            "qr_code_url": config.qr_code_reference,
            "minimum_deposit": config.minimum_deposit,
            "maximum_deposit": config.maximum_deposit,
            "deposit_instructions": config.deposit_instructions,
        }
        for config in manual_configs
    ]
    active_gw = get_active_gateway_config(db)
    if active_gw and active_gw.is_active:
        return success_response({
            "active_gateway": active_gw.gateway_name,
            "display_name": active_gw.display_name,
            "is_sandbox": active_gw.is_sandbox,
            "key_id": active_gw.api_key if active_gw.gateway_name == "razorpay" else None,
            "app_id": active_gw.api_key if active_gw.gateway_name == "cashfree" else None,
            "has_credentials": bool(active_gw.api_key and active_gw.api_secret),
            "manual_payment": manual_items[0] if manual_items else None,
            "manual_configs": manual_items,
        })
    return success_response({
        "active_gateway": settings.PAYMENT_PROVIDER or "razorpay",
        "display_name": "Razorpay Standard PG",
        "is_sandbox": True,
        "key_id": settings.PAYMENT_API_KEY,
        "app_id": None,
        "has_credentials": bool(settings.PAYMENT_API_KEY and settings.PAYMENT_SECRET),
        "manual_payment": manual_items[0] if manual_items else None,
        "manual_configs": manual_items,
    })


@router.post("/manual", status_code=201)
def create_manual_deposit(
    data: ManualDepositCreateIn,
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    """Create a pending manual UPI deposit for admin review; never credits here."""
    if data.amount <= 0:
        return error_response("DEPOSIT_ERROR", "Deposit amount must be greater than zero")

    config_query = db.query(PaymentConfiguration).filter(
        PaymentConfiguration.enabled.is_(True)
    )
    config = (
        config_query.filter(PaymentConfiguration.id == data.config_id).first()
        if data.config_id
        else config_query.order_by(PaymentConfiguration.created_at.asc()).first()
    )
    if not config and data.config_id:
        config = db.query(PaymentConfiguration).filter(PaymentConfiguration.id == data.config_id).first()
    if not config:
        config = db.query(PaymentConfiguration).filter(
            PaymentConfiguration.upi_id.isnot(None),
            PaymentConfiguration.upi_id != "",
        ).order_by(PaymentConfiguration.created_at.asc()).first()
    if not config or not config.upi_id:
        return error_response("NO_ACTIVE_CONFIG", "Manual UPI payment is not available", status_code=400)
    if data.amount < config.minimum_deposit or data.amount > config.maximum_deposit:
        return error_response(
            "DEPOSIT_ERROR",
            f"Amount must be between ₹{config.minimum_deposit / 100:.2f} and ₹{config.maximum_deposit / 100:.2f}",
        )

    wallet = db.query(Wallet).filter(Wallet.user_id == current_user.id).first()
    if not wallet:
        return error_response("DEPOSIT_ERROR", "Wallet not found for user")
    if db.query(Deposit).filter(Deposit.external_reference == data.transaction_id).first():
        return error_response("DUPLICATE_TRANSACTION", "This transaction ID has already been submitted", status_code=409)

    deposit = Deposit(
        user_id=current_user.id,
        wallet_id=wallet.id,
        amount=data.amount,
        status=DepositStatus.PENDING,
        provider="manual_upi",
        external_reference=data.transaction_id,
        metadata_={
            "payment_method": config.display_name,
            "config_id": str(config.id),
            "upi_id": config.upi_id,
            "remarks": data.remarks,
        },
    )
    db.add(deposit)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return error_response("DUPLICATE_TRANSACTION", "This transaction ID has already been submitted", status_code=409)
    db.refresh(deposit)
    response = DepositOut.model_validate(deposit).model_dump()
    response["transaction_id"] = deposit.external_reference
    response["payment_method"] = config.display_name
    return success_response(response, status_code=201)


@router.get("/my")
def get_my_deposits(
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    deposits = db.query(Deposit).filter(
        Deposit.user_id == current_user.id
    ).order_by(Deposit.created_at.desc()).limit(100).all()
    items = []
    for deposit in deposits:
        item = DepositOut.model_validate(deposit).model_dump()
        item["transaction_id"] = deposit.external_reference if deposit.provider == "manual_upi" else None
        item["payment_method"] = (deposit.metadata_ or {}).get("payment_method", deposit.provider)
        items.append(item)
    return success_response(items)


@router.post("")
def create_deposit(
    data: DepositCreateIn,
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    try:
        active_gw = get_active_gateway_config(db)
        if active_gw and active_gw.is_active:
            provider = active_gw.gateway_name.strip().lower()
        else:
            provider = (
                data.provider
                or settings.PAYMENT_PROVIDER
                or "razorpay"
            ).strip().lower()

        customer_email = getattr(current_user, "email", None) or f"user_{str(current_user.id)[:8]}@corona888.tech"
        raw_phone = getattr(current_user, "phone", None) or ""
        digits_phone = "".join(filter(str.isdigit, str(raw_phone)))
        customer_phone = digits_phone if len(digits_phone) == 10 else "9999999999"

        deposit = deposit_service.create_deposit(
            db=db,
            user_id=current_user.id,
            amount=data.amount,
            provider=provider,
            provider_name=provider,
            metadata={
                "email": customer_email,
                "phone": customer_phone,
                "name": current_user.name or current_user.username or "Player",
            },
        )

        response = DepositOut.model_validate(
            deposit
        ).model_dump()

        response["provider"] = provider
        response["currency"] = "INR"

        if provider == "razorpay":
            key_id = (active_gw.api_key if active_gw and active_gw.gateway_name == "razorpay" and active_gw.api_key else settings.PAYMENT_API_KEY)
            response["key_id"] = key_id
        elif provider == "cashfree":
            meta = deposit.metadata_ or {}
            response["payment_session_id"] = meta.get("payment_session_id")
            response["environment"] = meta.get("environment", "sandbox" if (active_gw and active_gw.is_sandbox) else "production")
            response["app_id"] = active_gw.api_key if active_gw else ""

        return success_response(
            response,
            status_code=201,
        )

    except ValueError as e:
        return error_response(
            "DEPOSIT_ERROR",
            str(e),
        )
    except Exception as e:
        return error_response(
            "DEPOSIT_ERROR",
            str(e) or "An unexpected error occurred while initiating payment.",
        )


@router.post("/{deposit_id}/verify")
def verify_deposit(
    deposit_id: UUID,
    data: DepositVerifyIn,
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    try:
        deposit = deposit_service.verify_deposit_payment(
            db=db,
            deposit_id=deposit_id,
            user_id=current_user.id,
            provider_order_id=data.provider_order_id,
            provider_payment_id=data.provider_payment_id,
            signature=data.signature,
        )

        response = DepositOut.model_validate(
            deposit
        ).model_dump()

        response["currency"] = "INR"

        return success_response(response)

    except ValueError as e:
        return error_response(
            "DEPOSIT_VERIFICATION_ERROR",
            str(e),
        )