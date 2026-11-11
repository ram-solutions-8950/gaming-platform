import asyncio
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from ..dependencies.database import get_db
from ..security.permissions import require_user
from ..models.user import User
from ..models.poker import PokerTable, PokerHand, PokerPlayer
from ..services.poker.game_manager import poker_manager
from ..services.poker.cashout import cash_out_stack
from ..services.wallet_service import credit_wallet, debit_wallet
from ..models.transaction import WalletTransactionType
from ..utils.async_db import in_thread
from ..utils.logging import get_logger

logger = get_logger("poker")

router = APIRouter(prefix="/poker", tags=["Poker"])

class CreatePokerTableRequest(BaseModel):
    name: str = Field(default="Texas Hold'em Table", max_length=100)
    is_practice: bool = False
    small_blind: int = Field(default=100, ge=10)
    big_blind: int = Field(default=200, ge=20)
    min_buy_in: int = Field(default=2000, ge=100)
    max_buy_in: int = Field(default=20000, ge=200)
    max_players: int = Field(default=6, ge=2, le=6)

class JoinPokerTableRequest(BaseModel):
    buy_in_amount: int = Field(..., ge=100)

@router.get("/tables")
def list_poker_tables(db: Session = Depends(get_db)):
    db_tables = db.query(PokerTable).order_by(PokerTable.created_at.desc()).all()
    res = []
    for t in db_tables:
        engine = poker_manager.get_or_create_table(
            table_id=t.id,
            is_practice=t.is_practice,
            small_blind=t.small_blind,
            big_blind=t.big_blind,
            max_players=t.max_players
        )
        res.append({
            "id": t.id,
            "name": t.name,
            "is_practice": t.is_practice,
            "small_blind": t.small_blind,
            "big_blind": t.big_blind,
            "min_buy_in": t.min_buy_in,
            "max_buy_in": t.max_buy_in,
            "max_players": t.max_players,
            "player_count": len(engine.players),
            "phase": engine.phase,
        })
    return res

@router.post("/tables")
def create_poker_table(
    req: CreatePokerTableRequest,
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db)
):
    table = PokerTable(
        name=req.name,
        is_practice=req.is_practice,
        small_blind=req.small_blind,
        big_blind=req.big_blind,
        min_buy_in=req.min_buy_in,
        max_buy_in=req.max_buy_in,
        max_players=req.max_players
    )
    db.add(table)
    db.commit()
    db.refresh(table)

    poker_manager.get_or_create_table(
        table_id=table.id,
        is_practice=table.is_practice,
        small_blind=table.small_blind,
        big_blind=table.big_blind,
        max_players=table.max_players
    )

    return {
        "id": table.id,
        "name": table.name,
        "is_practice": table.is_practice,
        "small_blind": table.small_blind,
        "big_blind": table.big_blind,
        "min_buy_in": table.min_buy_in,
        "max_buy_in": table.max_buy_in,
        "max_players": table.max_players,
    }

@router.get("/tables/{table_id}")
def get_poker_table_details(
    table_id: str,
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db)
):
    engine = poker_manager.get_table(table_id)
    if not engine:
        t = db.query(PokerTable).filter(PokerTable.id == table_id).first()
        if not t:
            raise HTTPException(status_code=404, detail="Poker table not found")
        engine = poker_manager.get_or_create_table(
            table_id=t.id,
            is_practice=t.is_practice,
            small_blind=t.small_blind,
            big_blind=t.big_blind,
            max_players=t.max_players
        )

    return engine.get_public_state(for_user_id=str(current_user.id))

@router.post("/tables/{table_id}/join")
async def join_poker_table(
    table_id: str,
    req: JoinPokerTableRequest,
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db)
):
    # Blocking database work is pushed to worker threads, but the in-memory
    # poker engine is only ever touched from the event loop: it has no
    # internal locking and relies on that single-threaded access to stay
    # consistent. Scalars are copied out of the ORM objects up front because
    # a later commit expires those instances, and re-reading an expired
    # attribute would issue a fresh blocking query from the loop.
    username = current_user.username or current_user.email.split('@')[0]
    user_id_str = str(current_user.id)

    def _load():
        table = db.query(PokerTable).filter(PokerTable.id == table_id).first()
        if not table:
            return None
        lingering = db.query(PokerPlayer).filter(
            PokerPlayer.table_id == table.id,
            PokerPlayer.user_id == current_user.id,
        ).first()
        return {
            "id": table.id,
            "is_practice": table.is_practice,
            "min_buy_in": table.min_buy_in,
            "max_buy_in": table.max_buy_in,
            "small_blind": table.small_blind,
            "big_blind": table.big_blind,
            "max_players": table.max_players,
            "lingering_stack": lingering.stack if lingering else None,
        }

    info = await in_thread(_load)
    if info is None:
        raise HTTPException(status_code=404, detail="Poker table not found")

    if req.buy_in_amount < info["min_buy_in"] or req.buy_in_amount > info["max_buy_in"]:
        raise HTTPException(
            status_code=400,
            detail=f"Buy-in must be between ₹{info['min_buy_in']/100} and ₹{info['max_buy_in']/100}"
        )

    engine = poker_manager.get_or_create_table(
        table_id=info["id"],
        is_practice=info["is_practice"],
        small_blind=info["small_blind"],
        big_blind=info["big_blind"],
        max_players=info["max_players"],
    )

    if engine.get_player_by_id(user_id_str):
        return {"message": "Already seated at table", "table_id": info["id"]}

    # A seat record without a live seat means the table was restarted while the
    # player sat at it: give them that seat back instead of charging again.
    if info["lingering_stack"] is not None and not info["is_practice"]:
        ok, msg = engine.add_player(
            user_id=user_id_str,
            username=username,
            buy_in_amount=info["lingering_stack"],
        )
        if not ok:
            raise HTTPException(status_code=400, detail=msg)
        await _announce_seat(engine)
        return {"message": "Seat restored", "table_id": info["id"]}

    # Real-money wallet debit via WalletService
    if not info["is_practice"]:
        def _debit():
            debit_wallet(
                db=db,
                user_id=current_user.id,
                amount=req.buy_in_amount,
                tx_type=WalletTransactionType.GAME_ENTRY,
                reference_type="poker_buyin",
                reference_id=f"poker_buyin_{uuid.uuid4()}"
            )
            db.commit()

        try:
            await in_thread(_debit)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    ok, msg = engine.add_player(
        user_id=user_id_str,
        username=username,
        buy_in_amount=req.buy_in_amount
    )

    if not ok:
        # Refund buy-in if seating failed
        if not info["is_practice"]:
            def _refund():
                credit_wallet(
                    db=db,
                    user_id=current_user.id,
                    amount=req.buy_in_amount,
                    tx_type=WalletTransactionType.REFUND,
                    reference_type="poker_refund",
                    reference_id=f"poker_refund_{uuid.uuid4()}"
                )
                # The buy-in was never played, so it must not count as
                # play-through.
                from ..services.wager_service import reverse_wager
                reverse_wager(db, current_user.id, req.buy_in_amount, "poker")
                db.commit()

            try:
                await in_thread(_refund)
            except Exception:
                # The seat failed and the refund failed too; log loudly so the
                # stuck buy-in can be reconciled rather than vanishing.
                logger.critical(
                    "poker buy-in refund FAILED user=%s table=%s amount=%s",
                    user_id_str, info["id"], req.buy_in_amount, exc_info=True,
                )
        raise HTTPException(status_code=400, detail=msg)

    seat_index = engine.get_player_by_id(user_id_str).seat_index

    def _seat():
        db.add(PokerPlayer(
            table_id=info["id"],
            user_id=current_user.id,
            seat_index=seat_index,
            stack=req.buy_in_amount,
        ))
        db.commit()

    await in_thread(_seat)

    await _announce_seat(engine)
    return {"message": "Successfully joined table", "table_id": info["id"]}


async def _announce_seat(engine) -> None:
    try:
        from ..websocket.poker_ws import on_seat_taken
        await on_seat_taken(engine)
    except Exception:
        logger.warning("poker seat announce failed", exc_info=True)

@router.post("/tables/{table_id}/leave")
async def leave_poker_table(
    table_id: str,
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db)
):
    engine = poker_manager.get_table(table_id)
    if not engine:
        raise HTTPException(status_code=404, detail="Table not found")

    ok, msg, remaining_stack = engine.remove_player(str(current_user.id))
    if not ok:
        raise HTTPException(status_code=400, detail=msg)

    # Cashing the stack back out locks the wallet row, so it runs off the
    # event loop. is_practice is read inside the thread: cash_out_stack
    # commits, which would expire `table` and force a blocking re-read here.
    def _cash_out():
        table = db.query(PokerTable).filter(PokerTable.id == table_id).first()
        is_practice = bool(table and table.is_practice)
        credited = cash_out_stack(
            db, table, table_id, current_user.id, remaining_stack
        )
        return remaining_stack if is_practice else credited

    returned_stack = await in_thread(_cash_out)

    # Notify remaining table players via WebSocket
    try:
        from ..websocket.poker_ws import poker_ws_manager, run_bot_turns
        await poker_ws_manager.broadcast_table_state(engine)
        # If leaving ended the hand (or passed the turn to a bot), run the usual
        # settlement cooldown so the table moves on to the next hand, or back to
        # WAITING with the pot cleared when nobody is left to play.
        if engine.phase != 'WAITING':
            asyncio.create_task(run_bot_turns(engine))
    except Exception:
        logger.warning("poker leave broadcast failed table=%s", table_id, exc_info=True)

    return {"message": "Left table successfully", "returned_stack": returned_stack}

@router.get("/history")
def get_poker_history(
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db)
):
    hands = db.query(PokerHand).order_by(PokerHand.started_at.desc()).limit(20).all()
    return [{
        "id": h.id,
        "table_id": h.table_id,
        "pot": h.pot,
        "community_cards": h.community_cards,
        "winners_summary": h.winners_summary,
        "completed_at": h.completed_at
    } for h in hands]

@router.get("/hands/{hand_id}")
def get_poker_hand_details(
    hand_id: str,
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db)
):
    hand = db.query(PokerHand).filter(PokerHand.id == hand_id).first()
    if not hand:
        raise HTTPException(status_code=404, detail="Hand not found")
    return {
        "id": hand.id,
        "table_id": hand.table_id,
        "pot": hand.pot,
        "community_cards": hand.community_cards,
        "winners_summary": hand.winners_summary,
        "started_at": hand.started_at,
        "completed_at": hand.completed_at
    }
