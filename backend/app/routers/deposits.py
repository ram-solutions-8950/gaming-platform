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


@router.post("")
def create_deposit(
    data: DepositCreateIn,
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    try:
        provider = (
            data.provider
            or settings.PAYMENT_PROVIDER
            or ""
        ).strip().lower()

        deposit = deposit_service.create_deposit(
            db,
            current_user.id,
            data.amount,
            provider,
        )

        response = DepositOut.model_validate(
            deposit
        ).model_dump()

        if provider == "razorpay":
            response["currency"] = "INR"
            response["key_id"] = settings.PAYMENT_API_KEY

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