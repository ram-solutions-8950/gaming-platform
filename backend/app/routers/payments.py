from fastapi import APIRouter, Depends, Request, Query
from sqlalchemy.orm import Session
from ..dependencies.database import get_db
from ..payment.webhook import handle_webhook
from ..models.payment import PaymentConfiguration
from ..schemas.payment import ActivePaymentConfigOut
from ..security.permissions import require_user
from ..models.user import User
from ..utils.responses import success_response, error_response

router = APIRouter(prefix="/payments", tags=["Payments"])


@router.post("/webhook")
async def payment_webhook(
    request: Request,
    provider: str = Query(default="default"),
    db: Session = Depends(get_db),
):
    raw_body = await request.body()
    headers = dict(request.headers)
    result = handle_webhook(raw_body, headers, provider, db=db)
    return success_response(result)


@router.get("/config/active")
def get_active_payment_config(
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    """Return the active payment configuration for users. No secrets, no internal paths."""
    config = db.query(PaymentConfiguration).filter(PaymentConfiguration.enabled == True).first()
    if not config:
        return error_response(
            "NO_ACTIVE_CONFIG",
            "No active payment configuration is available at this time.",
            status_code=404,
        )

    # Build QR URL — return the relative URL path, never filesystem paths
    qr_url = config.qr_code_reference  # Already stored as "/uploads/qr/..."

    return success_response(ActivePaymentConfigOut(
        display_name=config.display_name,
        upi_id=config.upi_id,
        qr_code_url=qr_url,
        minimum_deposit=config.minimum_deposit,
        maximum_deposit=config.maximum_deposit,
        deposit_instructions=config.deposit_instructions,
    ).model_dump())
