from fastapi import APIRouter, Depends, Request, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from ..dependencies.database import get_db
from ..payment.webhook import handle_webhook
from ..models.payment import PaymentConfiguration
from ..schemas.payment import ActivePaymentConfigOut
from ..security.permissions import require_user
from ..models.user import User
from ..utils.responses import success_response, error_response
from ..utils.async_db import in_thread
from ..config import settings
from ..utils.logging import get_logger

router = APIRouter(prefix="/payments", tags=["Payments"])

logger = get_logger("payments")


@router.post("/webhook")
async def payment_webhook(
    request: Request,
    provider: str = Query(default="default"),
    db: Session = Depends(get_db),
):
    raw_body = await request.body()
    headers = dict(request.headers)

    try:
        # Crediting a deposit locks the deposit row and the wallet row. Run it
        # in a worker thread so a slow or contended webhook cannot stall the
        # event loop for every player on the site.
        result = await in_thread(
            handle_webhook,
            raw_body,
            headers,
            provider,
            db=db,
        )

        return success_response(result)

    except ValueError as exc:
        return error_response(
            "WEBHOOK_REJECTED",
            str(exc),
            status_code=400,
        )


@router.post("/easebuzz/return")
async def easebuzz_return(
    request: Request,
    db: Session = Depends(get_db),
):
    """Browser landing point for an Easebuzz payment (its surl/furl).

    Easebuzz sends the customer's browser here with a form POST carrying the
    signed result, so this is a page navigation and not a machine-to-machine
    call: it must answer with a redirect, never JSON.

    The payload is put through the very same ``handle_webhook`` pipeline as
    the server-to-server webhook -- identical signature check, identical
    idempotency key -- so whichever of the two arrives first credits the
    wallet and the other is recorded as a duplicate. Nothing here trusts the
    browser: a forged POST fails the reverse-hash check inside the pipeline
    and credits nothing.
    """
    raw_body = await request.body()
    headers = dict(request.headers)

    status = "failed"
    try:
        result = await in_thread(
            handle_webhook,
            raw_body,
            headers,
            "easebuzz",
            db=db,
        )
        outcome = str(result.get("status") or "").lower()
        if outcome in {"success", "already_processed"}:
            status = "success"
        elif outcome == "duplicate":
            # The webhook beat the browser here. Trust where the deposit
            # actually landed rather than assuming either outcome.
            prior = str(result.get("deposit_status") or "").upper()
            if prior == "SUCCESS":
                status = "success"
            elif prior in {"FAILED", "CANCELLED"}:
                status = "failed"
            else:
                status = "pending"
        elif outcome == "pending":
            status = "pending"
    except ValueError as exc:
        # A rejected or mismatched payment must still land the player on a
        # real page rather than an error body.
        logger.warning("Easebuzz return rejected: %s", exc)
    except Exception as exc:
        logger.error("Easebuzz return failed: %s", exc, exc_info=True)

    return RedirectResponse(
        url=f"{settings.FRONTEND_URL.rstrip('/')}/wallet?status={status}&provider=easebuzz",
        # 303 so the browser turns Easebuzz's POST into a GET of the wallet
        # page; a 307 would replay the POST against the frontend.
        status_code=303,
    )


@router.get("/config/active")
def get_active_payment_config(
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    """Return the active payment configuration for users. No secrets."""
    config = (
        db.query(PaymentConfiguration)
        .filter(PaymentConfiguration.enabled.is_(True))
        .first()
    )

    if not config:
        return error_response(
            "NO_ACTIVE_CONFIG",
            "No active payment configuration is available at this time.",
            status_code=404,
        )

    qr_url = config.qr_code_reference

    return success_response(
        ActivePaymentConfigOut(
            display_name=config.display_name,
            upi_id=config.upi_id,
            qr_code_url=qr_url,
            minimum_deposit=config.minimum_deposit,
            maximum_deposit=config.maximum_deposit,
            deposit_instructions=config.deposit_instructions,
        ).model_dump()
    )