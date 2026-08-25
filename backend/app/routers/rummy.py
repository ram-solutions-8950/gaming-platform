from __future__ import annotations

import secrets
import string
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..dependencies.database import get_db
from ..models.rummy import RummyRound, RummyTable, RummyTableMode, RummyTableStatus
from ..models.user import User
from ..schemas.rummy import JoinByCodeRequest, TableCreate, TableOut
from ..security.permissions import require_user
from ..services.rummy.game_manager import game_manager
from ..websocket.rummy_ws import router as ws_router

router = APIRouter(prefix="/rummy", tags=["Rummy"])
router.include_router(ws_router)

_CODE_ALPHABET = string.ascii_uppercase + string.digits


def _generate_join_code(db: Session) -> str:
    for _ in range(10):
        code = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(6))
        if db.query(RummyTable).filter(RummyTable.join_code == code).first() is None:
            return code
    raise HTTPException(status_code=500, detail="Could not allocate join code")


def _to_out(table: RummyTable) -> TableOut:
    game = game_manager.get(str(table.id))
    online = len(game.players) if game else 0
    return TableOut(
        id=table.id,
        name=table.name,
        mode=table.mode.value if hasattr(table.mode, "value") else str(table.mode),
        status=table.status.value if hasattr(table.status, "value") else str(table.status),
        max_players=table.max_players,
        num_deals=table.num_deals,
        entry_fee_paise=table.entry_fee_paise,
        pool_limit=table.pool_limit,
        turn_seconds=table.turn_seconds,
        starting_chips=table.starting_chips,
        is_private=table.is_private,
        join_code=table.join_code,
        online_players=online,
        created_at=table.created_at,
    )


@router.get("/tables", response_model=List[TableOut])
def list_tables(db: Session = Depends(get_db)) -> List[TableOut]:
    tables = (
        db.query(RummyTable)
        .filter(RummyTable.status != RummyTableStatus.FINISHED, RummyTable.is_private.is_(False))
        .order_by(RummyTable.created_at.desc())
        .limit(50)
        .all()
    )
    return [_to_out(t) for t in tables]


@router.post("/tables", response_model=TableOut, status_code=status.HTTP_201_CREATED)
def create_table(
    payload: TableCreate,
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db),
) -> TableOut:
    if payload.mode == "real_money" and payload.entry_fee_paise <= 0:
        raise HTTPException(status_code=400, detail="Real-money tables require an entry fee")

    join_code = _generate_join_code(db) if payload.is_private else None

    table = RummyTable(
        name=payload.name,
        mode=RummyTableMode(payload.mode),
        status=RummyTableStatus.OPEN,
        max_players=payload.max_players,
        num_deals=payload.num_deals,
        entry_fee_paise=payload.entry_fee_paise,
        pool_limit=payload.pool_limit,
        turn_seconds=payload.turn_seconds,
        starting_chips=payload.starting_chips,
        is_private=payload.is_private,
        join_code=join_code,
    )
    db.add(table)
    db.commit()
    db.refresh(table)
    return _to_out(table)


@router.get("/tables/{table_id}", response_model=TableOut)
def get_table(table_id: uuid.UUID, db: Session = Depends(get_db)) -> TableOut:
    table = db.query(RummyTable).filter(RummyTable.id == table_id).first()
    if table is None:
        raise HTTPException(status_code=404, detail="Table not found")
    return _to_out(table)


@router.post("/tables/join-by-code", response_model=TableOut)
def join_by_code(payload: JoinByCodeRequest, db: Session = Depends(get_db)) -> TableOut:
    table = (
        db.query(RummyTable)
        .filter(RummyTable.join_code == payload.code.strip().upper())
        .filter(RummyTable.status != RummyTableStatus.FINISHED)
        .first()
    )
    if table is None:
        raise HTTPException(status_code=404, detail="No active table with that join code")
    return _to_out(table)


@router.get("/history")
def get_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_user),
    limit: int = 20,
):
    rounds = (
        db.query(RummyRound)
        .order_by(RummyRound.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": str(r.id),
            "table_id": str(r.table_id),
            "winner_user_id": str(r.winner_user_id) if r.winner_user_id else None,
            "deals_played": r.deals_played,
            "prize_pool_paise": r.prize_pool_paise,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rounds
    ]
