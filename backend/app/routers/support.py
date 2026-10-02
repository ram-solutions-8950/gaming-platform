"""Player Support & Helpdesk Router."""
from typing import Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..dependencies.database import get_db
from ..security.permissions import require_user
from ..models.user import User
from ..services import support_service
from ..utils.responses import success_response, error_response

router = APIRouter(prefix="/support", tags=["Support & Helpdesk"])


class TicketCreateIn(BaseModel):
    category: str = Field(min_length=2, max_length=100)
    subject: str = Field(min_length=3, max_length=255)
    message: str = Field(min_length=5, max_length=5000)


@router.get("/contact")
def get_contact_info(db: Session = Depends(get_db)):
    """Return platform direct contact channels (WhatsApp VIP & official email) and FAQs."""
    cfg = support_service.get_support_config(db)
    # Ensure Telegram is completely omitted from the public support response
    return success_response({
        "whatsapp_vip": cfg.get("whatsapp_vip", "+91 98765 43210"),
        "whatsapp_url": cfg.get("whatsapp_url", "https://wa.me/919876543210"),
        "support_email": cfg.get("support_email", "support@corona888.tech"),
        "helpline_number": cfg.get("helpline_number", "1800-888-2026"),
        "working_hours": cfg.get("working_hours", "24/7 Live Support"),
        "faqs": cfg.get("faqs", []),
    })


@router.post("/tickets")
def submit_support_ticket(
    payload: TicketCreateIn,
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    """Player submits a new inquiry/complaint ticket to helpdesk."""
    ticket = support_service.create_ticket(
        db,
        user=user,
        category=payload.category,
        subject=payload.subject,
        message=payload.message,
    )
    return success_response({
        "id": str(ticket.id),
        "ticket_number": ticket.ticket_number,
        "category": ticket.category,
        "subject": ticket.subject,
        "status": ticket.status.value,
        "created_at": ticket.created_at.isoformat() if ticket.created_at else None,
        "message": f"Your ticket {ticket.ticket_number} has been registered with support desk.",
    }, status_code=201)


@router.get("/my-tickets")
def list_my_tickets(
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    """Retrieve history of tickets submitted by the authenticated player."""
    tickets = support_service.get_user_tickets(db, user.id)
    return success_response(tickets)
