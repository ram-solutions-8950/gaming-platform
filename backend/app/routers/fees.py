from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from ..dependencies.database import get_db
from ..schemas.fee import FeeConfigurationOut, FeeConfigurationUpdateIn
from ..models.fee_configuration import FeeConfiguration
from ..models.user import User
from ..security.permissions import require_admin, require_super_admin, require_user
from ..services import audit_service
from ..utils.responses import success_response

router = APIRouter(tags=["Fees"])

def get_or_create_fee_config(db: Session) -> FeeConfiguration:
    config = db.query(FeeConfiguration).first()
    if not config:
        config = FeeConfiguration()
        db.add(config)
        db.commit()
        db.refresh(config)
    return config

@router.get("/admin/fees", response_model=None)
def get_fees_admin(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    config = get_or_create_fee_config(db)
    return success_response(FeeConfigurationOut.model_validate(config).model_dump())

@router.patch("/admin/fees", response_model=None)
def update_fees_admin(
    data: FeeConfigurationUpdateIn,
    admin: User = Depends(require_super_admin),
    db: Session = Depends(get_db)
):
    config = get_or_create_fee_config(db)
    
    old_values = {
        "game_entry_fee_percent": float(config.game_entry_fee_percent),
        "winning_fee_percent": float(config.winning_fee_percent),
        "withdrawal_fee_percent": float(config.withdrawal_fee_percent)
    }

    config.game_entry_fee_percent = data.game_entry_fee_percent
    config.winning_fee_percent = data.winning_fee_percent
    config.withdrawal_fee_percent = data.withdrawal_fee_percent
    config.updated_by_id = admin.id

    new_values = {
        "game_entry_fee_percent": data.game_entry_fee_percent,
        "winning_fee_percent": data.winning_fee_percent,
        "withdrawal_fee_percent": data.withdrawal_fee_percent
    }

    audit_service.log_action(
        db, action="PLATFORM_FEE_UPDATED", actor_id=admin.id,
        entity_type="fee_configuration", entity_id=str(config.id),
        metadata={"old": old_values, "new": new_values},
    )

    db.commit()
    db.refresh(config)
    return success_response(FeeConfigurationOut.model_validate(config).model_dump())

@router.get("/fees", response_model=None)
def get_fees_public(
    user: User = Depends(require_user),
    db: Session = Depends(get_db)
):
    config = get_or_create_fee_config(db)
    # Exposing the same schema for users (they only read it, useful for frontend)
    return success_response(FeeConfigurationOut.model_validate(config).model_dump())
