from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from ..dependencies.database import get_db
from ..schemas.withdrawal import WithdrawalCreateIn, WithdrawalOut
from ..services import withdrawal_service
from ..security.permissions import require_user
from ..utils.responses import success_response, error_response
from ..models.user import User

router = APIRouter(prefix="/withdrawals", tags=["Withdrawals"])


@router.post("")
def create_withdrawal(data: WithdrawalCreateIn, current_user: User = Depends(require_user), db: Session = Depends(get_db)):
    try:
        w = withdrawal_service.create_withdrawal(
            db, current_user.id, data.amount, data.method, data.destination
        )
        return success_response(WithdrawalOut.model_validate(w).model_dump(), status_code=201)
    except ValueError as e:
        return error_response("WITHDRAWAL_ERROR", str(e))


@router.get("")
def list_user_withdrawals(
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    result = withdrawal_service.get_user_withdrawals(db, current_user.id, page=page, page_size=page_size)
    items_out = [WithdrawalOut.model_validate(w).model_dump() for w in result["items"]]
    return success_response({
        "total": result["total"],
        "page": result["page"],
        "page_size": result["page_size"],
        "items": items_out,
    })
