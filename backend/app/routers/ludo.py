from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status, Query
from sqlalchemy.orm import Session
from uuid import UUID
from datetime import datetime, timezone
import json
from typing import Dict, Any, List, Optional

from ..dependencies.database import get_db
from ..database import SessionLocal
from ..models.user import User
from ..models.ludo import LudoMatch, LudoPlayer, LudoMatchStatus, LudoColor
from ..schemas.ludo import (
    LudoMatchSchema,
    MatchmakingRequest,
    MatchmakingStatusResponse,
    MoveTokenRequest,
)
from ..security.permissions import require_user
from ..security.jwt import decode_access_token
from ..services.ludo.matchmaking import LudoMatchmakingService
from ..services.ludo.engine import LudoEngine
from ..services.ludo.rules import get_legal_token_indices
from ..websocket.ludo import ludo_ws_manager
from ..websocket.ludo_matchmaking import ludo_mm_manager
from ..utils.logging import get_logger

logger = get_logger("ludo_router")

router = APIRouter(prefix="/ludo", tags=["Ludo"])

def _format_match_state(match: LudoMatch, user_id: Optional[UUID] = None) -> Dict[str, Any]:
    player_data = []
    for p in match.players:
        p_dict = {
            "id": str(p.id),
            "user_id": str(p.user_id),
            "username": p.user.username if p.user else "Player",
            "color": p.color.value,
            "seat_index": p.seat_index,
            "is_ready": p.is_ready,
            "rank": p.rank,
            "consecutive_timeouts": p.consecutive_timeouts,
            "tokens": [
                {
                    "id": str(t.id),
                    "token_index": t.token_index,
                    "position": t.position,
                    "is_home": t.is_home,
                }
                for t in p.tokens
            ],
        }
        player_data.append(p_dict)

    # Remaining timer seconds
    remaining_timer = 0
    if match.turn_started_at and match.status == LudoMatchStatus.IN_PROGRESS:
        elapsed = (datetime.now(timezone.utc) - match.turn_started_at).total_seconds()
        remaining_timer = max(0, int(match.turn_timeout_seconds - elapsed))

    # Legal tokens for current player
    legal_indices = []
    if match.status == LudoMatchStatus.IN_PROGRESS and match.last_dice_roll is not None:
        curr_p = next((p for p in match.players if p.color == match.current_turn_color), None)
        if curr_p and (user_id is None or curr_p.user_id == user_id):
            color_map = {str(p.id): p.color for p in match.players}
            all_tokens = [t for p in match.players for t in p.tokens]
            legal_indices = get_legal_token_indices(
                curr_p.tokens,
                match.last_dice_roll,
                curr_p.color,
                all_tokens,
                color_map,
            )

    return {
        "id": str(match.id),
        "status": match.status.value,
        "current_turn_color": match.current_turn_color.value if match.current_turn_color else None,
        "last_dice_roll": match.last_dice_roll,
        "turn_timeout_seconds": match.turn_timeout_seconds,
        "remaining_timer_seconds": remaining_timer,
        "entry_fee": match.entry_fee,
        "prize_pool": match.prize_pool,
        "is_settled": match.is_settled,
        "created_at": match.created_at.isoformat() if match.created_at else None,
        "players": player_data,
        "legal_token_indices": legal_indices,
    }

# ----------------- Matchmaking Endpoints -----------------

@router.post("/matchmaking/join")
async def join_matchmaking(
    req: MatchmakingRequest,
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    service = LudoMatchmakingService(db)
    try:
        result = service.join_queue(
            user_id=current_user.id,
            player_count=req.player_count,
            entry_fee=req.entry_fee,
        )

        # If a match was just created, push MATCH_FOUND to all connected
        # players via the matchmaking WebSocket.
        # This happens AFTER the DB commit (inside join_queue).
        if result.get("status") == "MATCHED" and result.get("players"):
            match_id = result["match_id"]
            players_info = result["players"]

            # Build color map: user_id → color
            color_map = {
                p["user_id"]: p["color"] for p in players_info
            }

            base_payload = {
                "type": "MATCH_FOUND",
                "match_id": match_id,
                "players": players_info,
            }

            logger.info(
                f"[LUDO-MM] Sending MATCH_FOUND to {len(players_info)} players "
                f"match_id={match_id}"
            )

            delivery = await ludo_mm_manager.notify_users(
                user_ids=[p["user_id"] for p in players_info],
                base_payload=base_payload,
                color_map=color_map,
            )

            logger.info(f"[LUDO-MM] MATCH_FOUND delivery results: {delivery}")

        return result
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

@router.post("/matchmaking/cancel")
def cancel_matchmaking(
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    service = LudoMatchmakingService(db)
    cancelled = service.cancel_queue(user_id=current_user.id)
    return {"cancelled": cancelled}

@router.get("/matchmaking/status")
def get_matchmaking_status(
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    service = LudoMatchmakingService(db)
    return service.get_queue_status(user_id=current_user.id)

# ----------------- Matchmaking WebSocket -----------------

@router.websocket("/ws/matchmaking")
async def ludo_matchmaking_ws_endpoint(
    websocket: WebSocket,
    token: Optional[str] = Query(None),
):
    """
    Matchmaking WebSocket endpoint.

    Connection: /ludo/ws/matchmaking?token=JWT

    The frontend connects BEFORE calling POST /matchmaking/join.
    When a match is found, the server pushes MATCH_FOUND through this socket.
    """
    # 1. Authenticate
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return

    payload = decode_access_token(token)
    if not payload or not payload.get("sub"):
        await websocket.close(code=4001, reason="Invalid token")
        return

    user_id = payload["sub"]
    logger.info(f"[LUDO-MM-WS] Matchmaking WS connecting user={user_id}")

    # 2. Accept and register
    await websocket.accept()
    await ludo_mm_manager.connect(user_id, websocket)

    # 3. Send confirmation
    try:
        await websocket.send_text(json.dumps({
            "type": "CONNECTED",
            "user_id": user_id,
        }))
    except Exception:
        await ludo_mm_manager.disconnect(user_id)
        return

    # 4. Keep-alive loop
    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "PING":
                    await websocket.send_text(json.dumps({"type": "PONG"}))
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        logger.info(f"[LUDO-MM-WS] Matchmaking WS disconnected user={user_id}")
    except Exception as e:
        logger.error(f"[LUDO-MM-WS] WS error user={user_id}: {e}")
    finally:
        await ludo_mm_manager.disconnect(user_id)

        # Cancel SEARCHING queue entry on disconnect
        # (but NOT if already MATCHED or in a game)
        db = SessionLocal()
        try:
            service = LudoMatchmakingService(db)
            service.cancel_queue(UUID(user_id))
        except Exception as e:
            logger.error(f"[LUDO-MM-WS] Queue cleanup error user={user_id}: {e}")
        finally:
            db.close()

# ----------------- In-Game Endpoints -----------------

@router.get("/match/{match_id}/state")
def get_match_state(
    match_id: UUID,
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    engine = LudoEngine(db)
    match = engine.get_match(match_id)
    if not match:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")
    return _format_match_state(match, current_user.id)

@router.post("/match/{match_id}/roll")
async def roll_dice(
    match_id: UUID,
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    match_str = str(match_id)
    async with ludo_ws_manager.get_lock(match_str):
        engine = LudoEngine(db)
        try:
            res = engine.roll_dice(match_id=match_id, user_id=current_user.id)
            match = engine.get_match(match_id)
            state = _format_match_state(match)
            await ludo_ws_manager.broadcast(match_str, {
                "type": "DICE_ROLLED",
                "data": res,
                "state": state,
            })
            return res
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

@router.post("/match/{match_id}/move")
async def move_token(
    match_id: UUID,
    req: MoveTokenRequest,
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    match_str = str(match_id)
    async with ludo_ws_manager.get_lock(match_str):
        engine = LudoEngine(db)
        try:
            res = engine.move_token(
                match_id=match_id,
                user_id=current_user.id,
                token_index=req.token_index,
            )
            match = engine.get_match(match_id)
            state = _format_match_state(match)
            await ludo_ws_manager.broadcast(match_str, {
                "type": "TOKEN_MOVED",
                "data": res,
                "state": state,
            })
            return res
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

@router.post("/match/{match_id}/timeout")
async def force_timeout(
    match_id: UUID,
    db: Session = Depends(get_db),
):
    match_str = str(match_id)
    async with ludo_ws_manager.get_lock(match_str):
        engine = LudoEngine(db)
        res = engine.handle_timeout(match_id)
        if res.get("status") == "TIMEOUT":
            match = engine.get_match(match_id)
            state = _format_match_state(match)
            await ludo_ws_manager.broadcast(match_str, {
                "type": "TIMEOUT",
                "data": res,
                "state": state,
            })
        return res

@router.post("/match/{match_id}/leave")
async def leave_match(
    match_id: UUID,
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    match_str = str(match_id)
    async with ludo_ws_manager.get_lock(match_str):
        engine = LudoEngine(db)
        match = engine.get_match(match_id)
        if not match:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")

        player = engine.get_player_for_user(match, current_user.id)
        if not player:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User not in match")

        # Leaving active match marks player as forfeited
        player.rank = 99
        player.consecutive_timeouts = 3

        active_remaining = [p for p in match.players if p.rank is None or p.rank == 0]
        game_over = False
        winner_id = None

        if len(active_remaining) <= 1:
            winner = active_remaining[0] if active_remaining else None
            if winner:
                winner.rank = 1
                winner.finished_at = datetime.now(timezone.utc)
                winner_id = str(winner.user_id)
                engine._settle_match(match, winner.user_id)
            match.status = LudoMatchStatus.COMPLETED
            match.completed_at = datetime.now(timezone.utc)
            game_over = True
        else:
            if match.current_turn_color == player.color:
                engine._advance_to_next_turn(match)

        db.commit()
        state = _format_match_state(match)
        await ludo_ws_manager.broadcast(match_str, {
            "type": "PLAYER_FORFEITED",
            "data": {
                "user_id": str(current_user.id),
                "color": player.color.value,
                "game_over": game_over,
                "winner_user_id": winner_id,
            },
            "state": state,
        })
        return {"status": "FORFEITED", "game_over": game_over}

# ----------------- Game WebSocket Endpoint -----------------

@router.websocket("/ws/{match_id}")
async def ludo_websocket_endpoint(
    websocket: WebSocket,
    match_id: str,
    token: Optional[str] = Query(None),
):
    await ludo_ws_manager.connect(match_id, websocket)

    # Initial state push
    db = SessionLocal()
    try:
        match = db.query(LudoMatch).filter(LudoMatch.id == UUID(match_id)).first()
        if match:
            state = _format_match_state(match)
            await websocket.send_text(json.dumps({
                "type": "MATCH_STATE",
                "state": state,
            }, default=str))
    finally:
        db.close()

    try:
        while True:
            data = await websocket.receive_text()
            # Client can ping or send messages
            msg = json.loads(data)
            if msg.get("type") == "PING":
                await websocket.send_text(json.dumps({"type": "PONG"}))
    except WebSocketDisconnect:
        ludo_ws_manager.disconnect(match_id, websocket)
    except Exception as e:
        ludo_ws_manager.disconnect(match_id, websocket)
