from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from uuid import UUID
from ..dependencies.database import get_db
from ..schemas.deposit import DepositCreateIn, DepositOut
from ..services import deposit_service
from ..security.permissions import require_user
from ..utils.responses import success_response, error_response
from ..models.user import User

router = APIRouter(prefix="/deposits", tags=["Deposits"])


@router.post("")
def create_deposit(data: DepositCreateIn, current_user: User = Depends(require_user), db: Session = Depends(get_db)):
    try:
        deposit = deposit_service.create_deposit(db, current_user.id, data.amount, data.provider)
        return success_response(DepositOut.model_validate(deposit).model_dump(), status_code=201)
    except ValueError as e:
        return error_response("DEPOSIT_ERROR", str(e))
