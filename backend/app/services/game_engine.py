"""
Game engine — background task that manages the 60-second round lifecycle.

Runs as an asyncio task tied to the FastAPI lifespan.
The engine is the single source of truth for timing; the frontend
only mirrors the countdown.
"""

import asyncio
from ..database import SessionLocal
from ..services.game_engines import list_engines
from ..utils.logging import get_logger

logger = get_logger("game_engine")
_engine_tasks: list[asyncio.Task] = []


async def _run_engine_for_game(engine, broadcast_fn=None):
    logger.info("Game engine started for %s", engine.slug)
    while True:
        db = SessionLocal()
        try:
            game_round = engine.create_round(db)
            round_id = game_round.id
            betting_seconds = engine.get_betting_duration_seconds(db)
            round_seconds = engine.get_round_duration_seconds(db)
            logger.info("[%s] Round %s started", engine.slug, round_id)

            if broadcast_fn:
                await broadcast_fn({
                    "type": "round_start",
                    "game_slug": engine.slug,
                    "game_id": str(game_round.game_id),
                    "round_id": str(round_id),
                    "status": "BETTING",
                    "started_at": game_round.started_at.isoformat(),
                    "betting_closes_at": game_round.betting_closes_at.isoformat(),
                    "seconds_remaining": betting_seconds,
                })
        finally:
            db.close()

        await asyncio.sleep(betting_seconds)

        db = SessionLocal()
        try:
            engine.lock_round_for_calculation(db, round_id)
            if broadcast_fn:
                await broadcast_fn({
                    "type": "betting_locked",
                    "game_slug": engine.slug,
                    "game_id": str(game_round.game_id),
                    "round_id": str(round_id),
                    "status": "CALCULATING",
                    "seconds_remaining": round_seconds - betting_seconds,
                })
        finally:
            db.close()

        await asyncio.sleep(round_seconds - betting_seconds)

        db = SessionLocal()
        try:
            settled = engine.settle_round(db, round_id)
            if broadcast_fn:
                await broadcast_fn({
                    "type": "round_result",
                    "game_slug": engine.slug,
                    "game_id": str(settled.game_id),
                    "round_id": str(round_id),
                    "status": "COMPLETED",
                    "result_color": settled.result_color.value if settled.result_color else None,
                    "result_number": settled.result_number,
                    "result_data": settled.result_data,
                })
        finally:
            db.close()

        await asyncio.sleep(1)


def start_engine(broadcast_fn=None):
    global _engine_tasks
    if _engine_tasks and any(not t.done() for t in _engine_tasks):
        logger.warning("Game engine already running")
        return
    _engine_tasks = [
        asyncio.create_task(_run_engine_for_game(engine, broadcast_fn))
        for engine in list_engines()
    ]
    logger.info("Game engine tasks created: %d", len(_engine_tasks))


def stop_engine():
    global _engine_tasks
    for task in _engine_tasks:
        task.cancel()
    _engine_tasks = []
    logger.info("Game engine tasks cancelled")
