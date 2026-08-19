"""
Game engine — background task that manages the 60-second round lifecycle.

Runs as an asyncio task tied to the FastAPI lifespan.
The engine is the single source of truth for timing; the frontend
only mirrors the countdown.
"""

import asyncio
from datetime import datetime, timezone
from ..database import SessionLocal
from ..services.game_service import ROUND_DURATION_SECONDS, BETTING_WINDOW_SECONDS
from ..services.game_engines import get_engine
from ..utils.logging import get_logger

logger = get_logger("game_engine")
colour_engine = get_engine("colour-prediction")

# Global reference to the engine task
_engine_task: asyncio.Task | None = None


async def _run_engine(broadcast_fn=None):
    """Infinite loop that drives the game round lifecycle.

    Timeline for each 60-second round:
        0s   → Round created, status = BETTING
        50s  → Status transitions to CALCULATING (betting locked)
        60s  → Result generated, bets settled, status = COMPLETED
        Immediately → new round created
    """
    logger.info("Game engine started")
    while True:
        db = SessionLocal()
        try:
            # Create a new round
            game_round = colour_engine.create_round(db)
            round_id = game_round.id
            logger.info("Round %s started", round_id)

            if broadcast_fn:
                await broadcast_fn({
                    "type": "round_start",
                    "round_id": str(round_id),
                    "status": "BETTING",
                    "started_at": game_round.started_at.isoformat(),
                    "betting_closes_at": game_round.betting_closes_at.isoformat(),
                    "seconds_remaining": BETTING_WINDOW_SECONDS,
                })
        finally:
            db.close()

        # Wait for the betting window (50 seconds)
        await asyncio.sleep(BETTING_WINDOW_SECONDS)

        # Transition to CALCULATING
        db = SessionLocal()
        try:
            colour_engine.lock_round_for_calculation(db, round_id)
            if broadcast_fn:
                await broadcast_fn({
                    "type": "betting_locked",
                    "round_id": str(round_id),
                    "status": "CALCULATING",
                    "seconds_remaining": ROUND_DURATION_SECONDS - BETTING_WINDOW_SECONDS,
                })
        finally:
            db.close()

        # Wait for the calculation window (10 seconds)
        await asyncio.sleep(ROUND_DURATION_SECONDS - BETTING_WINDOW_SECONDS)

        # Settle the round
        db = SessionLocal()
        try:
            settled = colour_engine.settle_round(db, round_id)
            if broadcast_fn:
                await broadcast_fn({
                    "type": "round_result",
                    "round_id": str(round_id),
                    "status": "COMPLETED",
                    "result_color": settled.result_color.value if settled.result_color else None,
                    "result_number": settled.result_number,
                })
        finally:
            db.close()

        # Small pause before next round
        await asyncio.sleep(1)


def start_engine(broadcast_fn=None):
    """Start the game engine as a background asyncio task."""
    global _engine_task
    if _engine_task is not None and not _engine_task.done():
        logger.warning("Game engine already running")
        return
    _engine_task = asyncio.create_task(_run_engine(broadcast_fn))
    logger.info("Game engine task created")


def stop_engine():
    """Cancel the game engine task."""
    global _engine_task
    if _engine_task is not None:
        _engine_task.cancel()
        _engine_task = None
        logger.info("Game engine task cancelled")
