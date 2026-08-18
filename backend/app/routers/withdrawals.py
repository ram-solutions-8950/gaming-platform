from fastapi import APIRouter, Depends
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
