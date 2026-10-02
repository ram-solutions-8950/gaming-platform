from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from uuid import UUID

from ..config import settings
from ..dependencies.database import get_db
from ..schemas.deposit import (
    DepositCreateIn,
    DepositOut,
    DepositVerifyIn,
)
from ..services import deposit_service
from ..security.permissions import require_user
from ..utils.responses import success_response, error_response
from ..models.user import User

router = APIRouter(prefix="/deposits", tags=["Deposits"])


from ..services.payment_service import get_active_gateway_config

@router.get("/config")
def get_deposit_config(db: Session = Depends(get_db)):
    """Return active payment gateway details for client checkout."""
    active_gw = get_active_gateway_config(db)
    if active_gw and active_gw.is_active:
        return success_response({
            "active_gateway": active_gw.gateway_name,
            "display_name": active_gw.display_name,
            "is_sandbox": active_gw.is_sandbox,
            "key_id": active_gw.api_key if active_gw.gateway_name == "razorpay" else None,
            "app_id": active_gw.api_key if active_gw.gateway_name == "cashfree" else None,
        })
    return success_response({
        "active_gateway": settings.PAYMENT_PROVIDER or "razorpay",
        "display_name": "Online Payment",
        "is_sandbox": True,
        "key_id": settings.PAYMENT_API_KEY,
        "app_id": None,
    })


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

        customer_email = current_user.email or f"user_{str(current_user.id)[:8]}@corona888.tech"
        customer_phone = current_user.phone or "9999999999"

        deposit = deposit_service.create_deposit(
            db=db,
            user_id=current_user.id,
            amount=data.amount,
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