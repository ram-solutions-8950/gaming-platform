from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, HTTPException
from sqlalchemy.orm import Session
from typing import Dict, Any, List
import uuid
import json

from ..dependencies.database import get_db
from ..security.permissions import require_user
from ..models.user import User
from ..schemas.ludo import (
    CreateMatchRequest, JoinMatchRequest, ReadyRequest, 
    RollDiceRequest, MoveTokenRequest, LudoMatchSchema,
    JoinMatchmakingRequest, MatchmakingStatusResponse
)
from ..services.multiplayer_game_engines.ludo import LudoMultiplayerEngine
from ..services.ludo.matchmaking import LudoMatchmakingService
from ..websocket.ludo import ludo_ws_manager

router = APIRouter(prefix="/ludo", tags=["Ludo"])

@router.post("/matchmaking/join", response_model=MatchmakingStatusResponse)
def join_matchmaking(req: JoinMatchmakingRequest, db: Session = Depends(get_db), current_user: User = Depends(require_user)):
    service = LudoMatchmakingService(db)
    try:
        return service.join_queue(current_user.id, req.player_count, req.entry_fee)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/matchmaking/cancel")
def cancel_matchmaking(db: Session = Depends(get_db), current_user: User = Depends(require_user)):
    service = LudoMatchmakingService(db)
    service.cancel_queue(current_user.id)
    return {"success": True}

@router.get("/matchmaking/status", response_model=MatchmakingStatusResponse)
def matchmaking_status(db: Session = Depends(get_db), current_user: User = Depends(require_user)):
    service = LudoMatchmakingService(db)
    return service.get_status(current_user.id)

@router.post("/match", response_model=LudoMatchSchema)
def create_match(req: CreateMatchRequest, db: Session = Depends(get_db), current_user: User = Depends(require_user)):
    engine = LudoMultiplayerEngine(db)
    match = engine.create_match(current_user.id, turn_timeout_seconds=req.turn_timeout_seconds)
    return match

@router.post("/match/{match_id}/join", response_model=LudoMatchSchema)
def join_match(match_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(require_user)):
    engine = LudoMultiplayerEngine(db)
    try:
        match = engine.join_match(match_id, current_user.id)
        ludo_ws_manager.broadcast_to_match(match_id, {"type": "PLAYER_JOINED", "data": {"user_id": str(current_user.id)}})
        return match
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/match/{match_id}/ready", response_model=LudoMatchSchema)
def set_ready(match_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(require_user)):
    engine = LudoMultiplayerEngine(db)
    try:
        match = engine.set_ready(match_id, current_user.id)
        ludo_ws_manager.broadcast_to_match(match_id, {"type": "PLAYER_READY", "data": {"user_id": str(current_user.id)}})
        
        if match.status.value == "IN_PROGRESS":
            ludo_ws_manager.broadcast_to_match(match_id, {"type": "MATCH_STARTED", "data": {"match_id": str(match.id)}})
            
        return match
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/match/{match_id}/roll")
def roll_dice(match_id: uuid.UUID, req: RollDiceRequest, db: Session = Depends(get_db), current_user: User = Depends(require_user)):
    engine = LudoMultiplayerEngine(db)
    try:
        result = engine.process_action(match_id, current_user.id, "ROLL_DICE", {"idempotency_key": req.idempotency_key})
        ludo_ws_manager.broadcast_to_match(match_id, {"type": "DICE_ROLLED", "data": result})
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/match/{match_id}/move")
def move_token(match_id: uuid.UUID, req: MoveTokenRequest, db: Session = Depends(get_db), current_user: User = Depends(require_user)):
    engine = LudoMultiplayerEngine(db)
    try:
        result = engine.process_action(match_id, current_user.id, "MOVE_TOKEN", {
            "token_index": req.token_index,
            "idempotency_key": req.idempotency_key
        })
        ludo_ws_manager.broadcast_to_match(match_id, {"type": "TOKEN_MOVED", "data": result})
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/match/{match_id}/timeout")
def claim_timeout(match_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(require_user)):
    engine = LudoMultiplayerEngine(db)
    try:
        result = engine.process_action(match_id, current_user.id, "TIMEOUT", {})
        if result:
            ludo_ws_manager.broadcast_to_match(match_id, {"type": "TURN_TIMEOUT", "data": result})
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/match/{match_id}/state", response_model=LudoMatchSchema)
def get_match_state(match_id: uuid.UUID, db: Session = Depends(get_db)):
    from ..models.ludo import LudoMatch
    match = db.query(LudoMatch).filter(LudoMatch.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    return match

@router.websocket("/ws/{match_id}")
async def websocket_endpoint(websocket: WebSocket, match_id: uuid.UUID):
    await ludo_ws_manager.connect(websocket, match_id)
    try:
        while True:
            data = await websocket.receive_text()
            # handle ping/pong if needed
    except WebSocketDisconnect:
        ludo_ws_manager.disconnect(websocket, match_id)
