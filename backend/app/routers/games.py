from uuid import UUID as _UUID
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from ..dependencies.database import get_db
from ..schemas.game import PlaceBetIn, GameBetOut, GameRoundOut, GameStateOut
from ..services import game_service
from ..services.game_service import ROUND_DURATION_SECONDS
from ..security.permissions import require_user, require_admin
from ..utils.responses import success_response, error_response
from ..models.user import User
from ..websocket.manager import game_ws_manager

router = APIRouter(tags=["Games"])


# ── User endpoints ──────────────────────────────────────────────────

@router.get("/games/current")
def get_current_round(
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    game_round = game_service.get_current_round(db)
    now = datetime.now(timezone.utc)
    if game_round:
        remaining = max(0, (game_round.betting_closes_at - now).total_seconds())
        if game_round.status.value == "CALCULATING":
            started = game_round.started_at.replace(tzinfo=timezone.utc) if game_round.started_at.tzinfo is None else game_round.started_at
            round_end = started + timedelta(seconds=ROUND_DURATION_SECONDS)
            remaining = max(0, (round_end - now).total_seconds())
        state = GameStateOut(
            round=GameRoundOut.model_validate(game_round),
            server_time=now,
            seconds_remaining=round(remaining, 1),
        )
    else:
        state = GameStateOut(round=None, server_time=now, seconds_remaining=0)
    return success_response(state.model_dump())


@router.get("/games/history")
def get_round_history(
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db),
    limit: int = Query(default=20, ge=1, le=100),
):
    rounds = game_service.get_round_history(db, limit=limit)
    items = [GameRoundOut.model_validate(r).model_dump() for r in rounds]
    return success_response(items)


@router.post("/games/bet")
def place_bet(
    data: PlaceBetIn,
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    try:
        bet = game_service.place_bet(
            db,
            user_id=current_user.id,
            round_id=data.round_id,
            prediction_str=data.prediction,
            amount=data.amount,
        )
        return success_response(GameBetOut.model_validate(bet).model_dump(), status_code=201)
    except ValueError as e:
        return error_response("BET_ERROR", str(e))


@router.get("/games/my-bets")
def get_my_bets(
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    result = game_service.get_user_bets(db, current_user.id, page=page, page_size=page_size)
    items = [GameBetOut.model_validate(b).model_dump() for b in result["items"]]
    return success_response({
        "total": result["total"],
        "page": result["page"],
        "page_size": result["page_size"],
        "items": items,
    })


# ── Admin endpoints ─────────────────────────────────────────────────

@router.get("/admin/games/rounds")
def admin_list_rounds(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    result = game_service.get_admin_rounds(db, page=page, page_size=page_size)
    items = []
    for r in result["items"]:
        rd = GameRoundOut.model_validate(r).model_dump()
        summary = game_service.get_round_bets_summary(db, r.id)
        rd["total_bets"] = summary["total_bets"]
        rd["total_amount"] = summary["total_amount"]
        items.append(rd)
    return success_response({
        "total": result["total"],
        "page": result["page"],
        "page_size": result["page_size"],
        "items": items,
    })


@router.get("/admin/games/bets")
def admin_list_bets(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
    round_id: str = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    rid = _UUID(round_id) if round_id else None
    result = game_service.get_admin_bets(db, round_id=rid, page=page, page_size=page_size)
    items = [GameBetOut.model_validate(b).model_dump() for b in result["items"]]
    return success_response({
        "total": result["total"],
        "page": result["page"],
        "page_size": result["page_size"],
        "items": items,
    })


# ── WebSocket ───────────────────────────────────────────────────────

@router.websocket("/ws/games")
async def game_ws(websocket: WebSocket):
    await game_ws_manager.connect(websocket)
    try:
        while True:
            # Keep connection alive; ignore incoming messages
            await websocket.receive_text()
    except WebSocketDisconnect:
        game_ws_manager.disconnect(websocket)
