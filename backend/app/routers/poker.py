from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from ..dependencies.database import get_db
from ..security.permissions import require_user
from ..models.user import User
from ..models.poker import PokerTable, PokerHand, PokerPlayer
from ..services.poker.game_manager import poker_manager
from ..services.wallet_service import credit_wallet, debit_wallet
from ..models.transaction import WalletTransactionType

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
def join_poker_table(
    table_id: str,
    req: JoinPokerTableRequest,
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db)
):
    table = db.query(PokerTable).filter(PokerTable.id == table_id).first()
    if not table:
        raise HTTPException(status_code=404, detail="Poker table not found")

    if req.buy_in_amount < table.min_buy_in or req.buy_in_amount > table.max_buy_in:
        raise HTTPException(
            status_code=400,
            detail=f"Buy-in must be between ₹{table.min_buy_in/100} and ₹{table.max_buy_in/100}"
        )

    engine = poker_manager.get_or_create_table(
        table_id=table.id,
        is_practice=table.is_practice,
        small_blind=table.small_blind,
        big_blind=table.big_blind,
        max_players=table.max_players
    )

    if engine.get_player_by_id(str(current_user.id)):
        return {"message": "Already seated at table", "table_id": table.id}

    # Real-money wallet debit via WalletService
    if not table.is_practice:
        try:
            debit_wallet(
                db=db,
                user_id=current_user.id,
                amount=req.buy_in_amount,
                tx_type=WalletTransactionType.GAME_ENTRY,
                reference_type="poker_buyin",
                reference_id=f"{table.id}_{current_user.id}_{int(db.query(PokerPlayer).count())}"
            )
            db.commit()
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    ok, msg = engine.add_player(
        user_id=str(current_user.id),
        username=current_user.username or current_user.email.split('@')[0],
        buy_in_amount=req.buy_in_amount
    )

    if not ok:
        # Refund buy-in if seating failed
        if not table.is_practice:
            credit_wallet(
                db=db,
                user_id=current_user.id,
                amount=req.buy_in_amount,
                tx_type=WalletTransactionType.REFUND,
                reference_type="poker_refund",
                reference_id=f"{table.id}_{current_user.id}_{int(db.query(PokerPlayer).count())}"
            )
            db.commit()
        raise HTTPException(status_code=400, detail=msg)

    # Save to database
    db_player = PokerPlayer(
        table_id=table.id,
        user_id=current_user.id,
        seat_index=engine.get_player_by_id(str(current_user.id)).seat_index,
        stack=req.buy_in_amount
    )
    db.add(db_player)
    db.commit()

    return {"message": "Successfully joined table", "table_id": table.id}

@router.post("/tables/{table_id}/leave")
def leave_poker_table(
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

    table = db.query(PokerTable).filter(PokerTable.id == table_id).first()
    if table and not table.is_practice and remaining_stack > 0:
        credit_wallet(
            db=db,
            user_id=current_user.id,
            amount=remaining_stack,
            tx_type=WalletTransactionType.GAME_WIN,
            reference_type="poker_leave",
            reference_id=f"{table.id}_{current_user.id}_{remaining_stack}"
        )
        db.commit()

    db.query(PokerPlayer).filter(
        PokerPlayer.table_id == table_id,
        PokerPlayer.user_id == current_user.id
    ).delete()
    db.commit()

    return {"message": "Left table successfully", "returned_stack": remaining_stack}

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
