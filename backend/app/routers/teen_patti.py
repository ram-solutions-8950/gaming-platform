"""
Teen Patti REST Router.
"""
from __future__ import annotations

import json
import secrets
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..dependencies.database import get_db
from ..models.teen_patti import TeenPattiHandHistory, TeenPattiTable, TeenPattiTableMode, TeenPattiTableStatus
from ..models.transaction import WalletTransactionType
from ..models.user import User
from ..schemas.teen_patti import HandHistoryOut, PlayHandRequest, PlayHandResponse, TableCreate, TableJoinByCode, TableOut
from ..security.permissions import require_user
from ..services.teen_patti import bot_strategy
from ..services.teen_patti.cards import Card, new_server_seed, server_seed_hash
from ..services.teen_patti.engine import GameConfig, Phase, PlayerStatus, TeenPattiHand
from ..services.teen_patti.manager import teen_patti_manager
from ..services.wallet_service import credit_wallet, debit_wallet, get_balance

router = APIRouter(prefix="/teen-patti", tags=["teen-patti"])


def _generate_join_code() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(6))


@router.post("/play", response_model=PlayHandResponse)
def play_instant_hand(
    req: PlayHandRequest,
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    boot = req.boot
    # Debit boot upfront
    ref_id = f"tp_instant_{current_user.id}_{req.nonce}_{uuid.uuid4().hex[:8]}"
    if req.mode == "real":
        try:
            debit_wallet(
                db=db,
                user_id=current_user.id,
                amount=boot,
                tx_type=WalletTransactionType.GAME_ENTRY,
                reference_type="TEEN_PATTI_STAKE",
                reference_id=ref_id,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    config = GameConfig(boot_amount=boot, max_players=4)
    s_seed = new_server_seed()
    hand = TeenPattiHand(config, server_seed=s_seed)

    hand.add_seat(str(current_user.id), current_user.name or current_user.username, is_bot=False)
    for i in range(1, 4):
        hand.add_seat(f"bot_{i}", f"Bot {i}", is_bot=True)

    hand.start_hand(client_seed=req.client_seed, nonce=req.nonce)

    # Auto-play the full hand using bot strategy
    max_rounds = 40
    rounds = 0
    while hand.phase == Phase.PLAYING and rounds < max_rounds:
        rounds += 1
        current_idx = hand.current_turn
        seat = hand.seats[current_idx]
        if not seat.is_in_hand:
            continue

        if not seat.seen:
            if bot_strategy.decide_see(seat.cards, seat.blind_count, hand.pot, hand.current_stake, hand.rng):
                hand.see(seat.id)

        active_count = len(hand._active_seats())
        can_side_show = seat.seen and hand.prev_seen_seat_index(current_idx) is not None
        can_show = (active_count == 2)

        act = bot_strategy.decide_action(
            cards=seat.cards,
            seen=seat.seen,
            active_count=active_count,
            can_side_show=can_side_show,
            can_show=can_show,
            current_stake=hand.current_stake,
            pot=hand.pot,
            rng=hand.rng,
        )

        if act == bot_strategy.Action.PACK:
            hand.pack(seat.id)
        elif act == bot_strategy.Action.RAISE:
            hand.bet(seat.id, raise_=True)
        elif act == bot_strategy.Action.SHOW and can_show:
            hand.show(seat.id)
        elif act == bot_strategy.Action.SIDE_SHOW and can_side_show:
            hand.side_show(seat.id)
        else:
            hand.bet(seat.id, raise_=False)

    if hand.phase == Phase.PLAYING:
        active = hand._active_seats()
        if len(active) == 2:
            hand.show(hand.seats[active[0]].id)
        elif active:
            hand._finish_hand(active[0], reason="Time cap")

    user_won = (hand.winner_seat == 0)
    payout = hand.pot if user_won else 0

    if user_won and req.mode == "real":
        credit_wallet(
            db=db,
            user_id=current_user.id,
            amount=payout,
            tx_type=WalletTransactionType.GAME_WIN,
            reference_type="TEEN_PATTI_PAYOUT",
            reference_id=f"payout_{ref_id}",
        )

    # Record history
    history = TeenPattiHandHistory(
        user_id=current_user.id,
        table_id=None,
        mode=req.mode,
        boot=boot,
        pot=hand.pot,
        winner_seat=hand.winner_seat or 0,
        won=user_won,
        payout=payout,
        hand_json=json.dumps(hand.as_dict(str(current_user.id))),
        client_seed=req.client_seed,
        nonce=req.nonce,
        server_seed=s_seed,
        server_seed_hash=server_seed_hash(s_seed),
    )
    db.add(history)
    db.commit()
    db.refresh(history)

    w = get_balance(db, current_user.id)
    current_balance = w.balance if w else 0

    return PlayHandResponse(
        id=str(history.id),
        hand=hand.as_dict(str(current_user.id)),
        user_won=user_won,
        boot=boot,
        pot=hand.pot,
        payout=payout,
        balance=current_balance,
        server_seed_hash=server_seed_hash(s_seed),
    )


@router.get("/tables", response_model=List[TableOut])
def list_tables(
    mode: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(TeenPattiTable).filter(
        TeenPattiTable.is_private == False,
        TeenPattiTable.status.in_([TeenPattiTableStatus.OPEN, TeenPattiTableStatus.RUNNING]),
    )
    if mode:
        q = q.filter(TeenPattiTable.mode == mode)
    tables = q.order_by(TeenPattiTable.created_at.desc()).all()
    results = []
    for t in tables:
        live = teen_patti_manager.get(str(t.id))
        count = len(live.seats) if live else 0
        out = TableOut.model_validate(t)
        out.player_count = count
        results.append(out)
    return results


@router.post("/tables", response_model=TableOut, status_code=status.HTTP_201_CREATED)
def create_table(
    req: TableCreate,
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    join_code = _generate_join_code() if req.is_private else None
    table = TeenPattiTable(
        name=req.name,
        mode=TeenPattiTableMode(req.mode),
        status=TeenPattiTableStatus.OPEN,
        max_players=req.max_players,
        boot_amount=req.boot_amount,
        turn_seconds=req.turn_seconds,
        is_private=req.is_private,
        join_code=join_code,
    )
    db.add(table)
    db.commit()
    db.refresh(table)

    # Initialize in manager
    cfg = GameConfig(
        boot_amount=table.boot_amount,
        max_players=table.max_players,
        turn_seconds=table.turn_seconds,
    )
    teen_patti_manager.get_or_create(str(table.id), cfg)

    out = TableOut.model_validate(table)
    out.player_count = 0
    return out


@router.post("/tables/join-by-code", response_model=TableOut)
def join_by_code(
    payload: TableJoinByCode,
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    table = db.query(TeenPattiTable).filter(
        TeenPattiTable.join_code == payload.code.upper().strip()
    ).first()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found with this join code")
    if table.status == TeenPattiTableStatus.FINISHED:
        raise HTTPException(status_code=400, detail="Table has already finished")

    live = teen_patti_manager.get(str(table.id))
    count = len(live.seats) if live else 0
    out = TableOut.model_validate(table)
    out.player_count = count
    return out


@router.get("/tables/{table_id}", response_model=TableOut)
def get_table(
    table_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    table = db.query(TeenPattiTable).filter(TeenPattiTable.id == table_id).first()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    live = teen_patti_manager.get(str(table.id))
    count = len(live.seats) if live else 0
    out = TableOut.model_validate(table)
    out.player_count = count
    return out


@router.get("/history", response_model=List[HandHistoryOut])
def get_user_history(
    limit: int = Query(20, ge=1, le=50),
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    records = db.query(TeenPattiHandHistory).filter(
        TeenPattiHandHistory.user_id == current_user.id
    ).order_by(TeenPattiHandHistory.created_at.desc()).limit(limit).all()
    return records
