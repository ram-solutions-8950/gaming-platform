import json
from typing import Optional, Any
from sqlalchemy.orm import Session
from ..models.audit_log import AuditLog
from ..utils.logging import get_logger

logger = get_logger("audit")


def log_action(
    db: Session,
    action: str,
    actor_id: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    metadata: Optional[dict] = None,
    ip_address: Optional[str] = None,
) -> AuditLog:
    entry = AuditLog(
        actor_id=actor_id,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id else None,
        metadata_=metadata,
        ip_address=ip_address,
    )
    db.add(entry)
    db.flush()
    logger.info(json.dumps({
        "event": "audit",
        "action": action,
        "actor_id": str(actor_id) if actor_id else None,
        "entity_type": entity_type,
        "entity_id": str(entity_id) if entity_id else None,
    }))
    return entry
