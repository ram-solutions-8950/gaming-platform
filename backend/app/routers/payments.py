from fastapi import APIRouter, Depends, Request, Query
from sqlalchemy.orm import Session
from ..dependencies.database import get_db
from ..payment.webhook import handle_webhook
from ..utils.responses import success_response

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
