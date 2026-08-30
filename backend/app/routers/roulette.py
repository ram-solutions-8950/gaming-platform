"""
Roulette Router — REST & WebSocket endpoints for live European Roulette.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from sqlalchemy.orm import Session

from ..dependencies.database import get_db
from ..security.permissions import require_user
from ..models.user import User
from ..services.roulette.engine import roulette_engine
from ..utils.responses import success_response, error_response

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/games/roulette", tags=["Roulette"])


class BetEntry(BaseModel):
    bet_type: str = Field(..., description="Type of bet: straight, split, street, corner, six_line, column, dozen, red, black, even, odd, low, high")
    target: str = Field(..., description="Bet target: e.g. 17, red, black, 1st12, col1, 1-18, etc.")
    amount: float = Field(..., ge=1, le=50000, description="Amount in INR")


class PlaceBetsIn(BaseModel):
    bets: List[BetEntry] = Field(..., min_length=1)


@router.get("/state")
def get_roulette_state(
    current_user: User = Depends(require_user),
):
    """Retrieve the current live round state, phase, timers, and user bets."""
    state = roulette_engine.get_state(user_id=str(current_user.id))
    return success_response(state)


@router.post("/bet")
def place_roulette_bet(
    payload: PlaceBetsIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_user),
):
    """Place bets on the active Roulette round with atomic wallet deduction."""
    try:
        res = roulette_engine.place_bets(
            db=db,
            user=current_user,
            bets_data=[b.model_dump() for b in payload.bets]
        )
        return success_response(res)
    except ValueError as e:
        return error_response("BET_ERROR", str(e), status_code=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        logger.error(f"Unexpected error placing roulette bet: {e}", exc_info=True)
        return error_response("INTERNAL_ERROR", "Failed placing bets", status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)


@router.post("/clear")
def clear_roulette_bets(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_user),
):
    """Clear bets and refund wallet during the active betting phase."""
    try:
        res = roulette_engine.clear_user_bets(db=db, user=current_user)
        return success_response(res)
    except ValueError as e:
        return error_response("CLEAR_ERROR", str(e), status_code=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        logger.error(f"Unexpected error clearing roulette bets: {e}", exc_info=True)
        return error_response("INTERNAL_ERROR", "Failed clearing bets", status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)


@router.get("/history")
def get_roulette_history(
    current_user: User = Depends(require_user),
):
    """Retrieve past winning numbers history."""
    return success_response({"history": roulette_engine.history})


@router.websocket("/ws")
async def roulette_websocket(websocket: WebSocket):
    """Real-time updates broadcast for Roulette game state and countdown."""
    await websocket.accept()
    try:
        while True:
            # Send current state every 500ms
            state = roulette_engine.get_state()
            await websocket.send_json({
                "type": "STATE_UPDATE",
                "data": state
            })

            # Check if client sent any ping message
            try:
                msg = await asyncio.wait_for(websocket.receive_text(), timeout=0.5)
                data = json.loads(msg)
                if data.get("type") == "PING":
                    await websocket.send_json({"type": "PONG"})
            except asyncio.TimeoutError:
                pass
            except Exception:
                break
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.warning(f"Roulette WebSocket connection closed: {e}")
