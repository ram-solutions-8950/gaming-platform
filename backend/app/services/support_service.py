"""Support service managing customer tickets, email notifications, and contact channels."""
import random
from typing import Optional, List, Dict, Any
from uuid import UUID
from datetime import datetime, timezone

from sqlalchemy.orm import Session
from sqlalchemy import or_, cast, String

from ..models.support import SupportTicket, SupportTicketStatus
from ..models.system_settings import SystemSetting
from ..models.user import User
from ..services.audit_service import log_action
from ..utils.logging import get_logger

logger = get_logger("support")

DEFAULT_SUPPORT_CONFIG = {
    "whatsapp_vip": "+91 98765 43210",
    "whatsapp_url": "https://wa.me/919876543210",
    "support_email": "support@corona888.tech",
    "helpline_number": "1800-888-2026",
    "working_hours": "24/7 Live VIP Support",
    "faqs": [
        {
            "id": "faq-1",
            "question": "How long does a withdrawal take to credit?",
            "answer": "Withdrawals are reviewed by financial operators within 15-30 minutes and transferred instantly via IMPS/UPI.",
        },
        {
            "id": "faq-2",
            "question": "My deposit is not reflecting in my balance. What to do?",
            "answer": "If a bank transfer or UPI payment takes longer than 5 minutes, send your 12-digit UTR number directly to VIP Support for immediate manual verification.",
        },
        {
            "id": "faq-3",
            "question": "What are the wagering requirements before withdrawal?",
            "answer": "Deposits require standard 1x wagering turnover. View your exact playthrough progress in the Wager status tab.",
        },
    ],
}


def get_support_config(db: Session) -> dict:
    """Retrieve dynamic support config from database or return default."""
    row = db.query(SystemSetting).filter(SystemSetting.key == "support_config").first()
    if not row or not row.value:
        return DEFAULT_SUPPORT_CONFIG.copy()
    cfg = DEFAULT_SUPPORT_CONFIG.copy()
    cfg.update(row.value)
    return cfg


def update_support_config(db: Session, update_data: dict, admin_id: UUID) -> dict:
    """Update support channels and persist in database."""
    from sqlalchemy.orm.attributes import flag_modified
    row = db.query(SystemSetting).filter(SystemSetting.key == "support_config").first()
    current = DEFAULT_SUPPORT_CONFIG.copy()
    if row and row.value:
        current.update(row.value)
    current.update(update_data)

    # Automatically synchronize whatsapp_url if whatsapp_vip was updated and whatsapp_url wasn't customized
    if "whatsapp_vip" in update_data and update_data["whatsapp_vip"]:
        clean_num = "".join(ch for ch in str(update_data["whatsapp_vip"]) if ch.isdigit())
        if clean_num and ("whatsapp_url" not in update_data or not update_data["whatsapp_url"]):
            current["whatsapp_url"] = f"https://wa.me/{clean_num}"

    if not row:
        row = SystemSetting(
            key="support_config",
            value=dict(current),
            description="Player support channels and contact details",
        )
        db.add(row)
    else:
        row.value = dict(current)
        flag_modified(row, "value")
        row.updated_at = datetime.now(timezone.utc)

    log_action(
        db,
        action="SUPPORT_CONFIG_UPDATE",
        actor_id=admin_id,
        entity_type="support_configuration",
        entity_id="default",
        metadata=update_data,
    )
    db.commit()
    db.refresh(row)
    return current


def generate_ticket_number() -> str:
    """Generate a unique human-friendly ticket identifier."""
    return f"TK-{random.randint(100000, 999999)}"


def send_ticket_email_notification(ticket: SupportTicket, user: User, target_email: str) -> None:
    """Send or log email notification to the platform support inbox."""
    try:
        logger.info(
            "SUPPORT TICKET ALERT -> Sent to %s: Ticket %s from @%s [%s]: '%s'",
            target_email,
            ticket.ticket_number,
            user.username,
            ticket.category,
            ticket.subject,
        )
    except Exception as exc:
        logger.warning("Could not dispatch ticket notification email: %s", exc)


def create_ticket(
    db: Session,
    user: User,
    category: str,
    subject: str,
    message: str,
) -> SupportTicket:
    """Create a new support ticket submitted by a player."""
    cfg = get_support_config(db)
    target_email = cfg.get("support_email", "support@corona888.tech")

    # Generate unique ticket number
    for _ in range(5):
        num = generate_ticket_number()
        exists = db.query(SupportTicket).filter(SupportTicket.ticket_number == num).first()
        if not exists:
            break

    ticket = SupportTicket(
        ticket_number=num,
        user_id=user.id,
        category=category.strip(),
        subject=subject.strip(),
        message=message.strip(),
        status=SupportTicketStatus.OPEN,
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)

    send_ticket_email_notification(ticket, user, target_email)
    return ticket


def get_user_tickets(db: Session, user_id: UUID) -> List[dict]:
    """Retrieve all tickets created by a specific user with resolution status."""
    tickets = (
        db.query(SupportTicket)
        .filter(SupportTicket.user_id == user_id)
        .order_by(SupportTicket.created_at.desc())
        .all()
    )
    return [
        {
            "id": str(t.id),
            "ticket_number": t.ticket_number,
            "category": t.category,
            "subject": t.subject,
            "message": t.message,
            "status": t.status.value if hasattr(t.status, "value") else str(t.status),
            "admin_reply": t.admin_reply,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "updated_at": t.updated_at.isoformat() if t.updated_at else None,
        }
        for t in tickets
    ]


def admin_list_tickets(
    db: Session,
    page: int = 1,
    page_size: int = 20,
    status: Optional[str] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
) -> dict:
    """Paginated ticket query for administrative support helpdesk."""
    query = db.query(SupportTicket).join(User, SupportTicket.user_id == User.id)

    if status and status != "ALL":
        query = query.filter(SupportTicket.status == status.upper())
    if category and category != "ALL":
        query = query.filter(SupportTicket.category == category)
    if search and search.strip():
        s = f"%{search.strip()}%"
        query = query.filter(
            or_(
                SupportTicket.ticket_number.ilike(s),
                SupportTicket.subject.ilike(s),
                SupportTicket.message.ilike(s),
                User.username.ilike(s),
                User.name.ilike(s),
                User.email.ilike(s),
                cast(SupportTicket.id, String).ilike(s),
                cast(SupportTicket.user_id, String).ilike(s),
            )
        )

    total = query.count()
    items = (
        query.order_by(SupportTicket.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    formatted = []
    for t in items:
        u = t.user
        formatted.append({
            "id": str(t.id),
            "ticket_number": t.ticket_number,
            "user_id": str(t.user_id),
            "user_name": u.name if u else "Unknown",
            "username": u.username if u else "unknown",
            "user_email": u.email if u else None,
            "category": t.category,
            "subject": t.subject,
            "message": t.message,
            "status": t.status.value if hasattr(t.status, "value") else str(t.status),
            "admin_reply": t.admin_reply,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "updated_at": t.updated_at.isoformat() if t.updated_at else None,
        })

    # Stats counts
    open_count = db.query(SupportTicket).filter(SupportTicket.status == SupportTicketStatus.OPEN).count()
    in_progress_count = db.query(SupportTicket).filter(SupportTicket.status == SupportTicketStatus.IN_PROGRESS).count()
    resolved_count = db.query(SupportTicket).filter(SupportTicket.status == SupportTicketStatus.RESOLVED).count()

    return {
        "items": formatted,
        "total": total,
        "page": page,
        "page_size": page_size,
        "stats": {
            "total": total,
            "open": open_count,
            "in_progress": in_progress_count,
            "resolved": resolved_count,
        }
    }


def admin_update_ticket(
    db: Session,
    ticket_id: UUID,
    status: str,
    admin_reply: Optional[str],
    admin: User,
) -> SupportTicket:
    """Update ticket resolution status and post reply."""
    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not ticket:
        raise ValueError("Support ticket not found")

    ticket.status = SupportTicketStatus(status.upper())
    if admin_reply is not None:
        ticket.admin_reply = admin_reply.strip()
    ticket.resolved_by = admin.id
    ticket.updated_at = datetime.now(timezone.utc)

    log_action(
        db,
        action="SUPPORT_TICKET_UPDATE",
        actor_id=admin.id,
        entity_type="support_ticket",
        entity_id=str(ticket.id),
        metadata={
            "ticket_number": ticket.ticket_number,
            "new_status": ticket.status.value,
            "has_reply": bool(ticket.admin_reply),
        },
    )
    db.commit()
    db.refresh(ticket)
    return ticket
