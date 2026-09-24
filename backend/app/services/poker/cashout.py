"""Returning a player's table chips to their wallet when they stop playing."""
import uuid
from typing import Optional

from sqlalchemy.orm import Session

from ...models.poker import PokerPlayer, PokerTable
from ..settlement_service import settle_winning_bet


def cash_out_stack(db: Session, table: Optional[PokerTable], table_id: str, user_id, stack: int) -> int:
    """Credit a departing player's stack to their wallet and free their seat record.

    Profit over what they bought in with is charged the winning fee like any
    other win; chips at or below the buy-in go back untouched (and stop counting
    as play-through). Practice chips are never credited. Returns the amount
    credited to the wallet.
    """
    uid = user_id if isinstance(user_id, uuid.UUID) else uuid.UUID(str(user_id))
    seats = db.query(PokerPlayer).filter(PokerPlayer.table_id == table_id, PokerPlayer.user_id == uid)
    seat = seats.first()
    credited = 0
    if table is not None and not table.is_practice and stack > 0:
        bought_in = seat.stack if seat else stack
        gross_profit = max(0, stack - bought_in)
        calc, _ = settle_winning_bet(
            db=db,
            user_id=uid,
            original_bet=min(stack, bought_in),
            gross_profit=gross_profit,
            reference_type="poker_leave",
            reference_id=f"poker_leave_{uuid.uuid4()}",
            game_slug="poker",
            is_refund=gross_profit == 0,
            metadata={"table_id": table_id, "remaining_stack": stack},
        )
        credited = calc.total_return
    seats.delete()
    db.commit()
    return credited
