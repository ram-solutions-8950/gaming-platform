"""
Game engine — background task that manages the 60-second round lifecycle.

Runs as an asyncio task tied to the FastAPI lifespan.
The engine is the single source of truth for timing; the frontend
only mirrors the countdown.

Resilience: a round that fails must never take the game down with it. A single
unhandled exception used to end the task, leaving the open round stuck in
BETTING forever — the frontend latches a permanent "STOP BETTING" overlay on
exactly that state — with nothing to restart it short of a redeploy. The loop
now recovers from a failed round, and a supervisor restarts the loop itself if
it ever manages to exit.
"""

import asyncio
from ..database import SessionLocal
from ..services.game_engines import list_engines
from ..utils.logging import get_logger

logger = get_logger("game_engine")
_engine_tasks: list[asyncio.Task] = []

# Consecutive failures back off, so a sustained outage (the database being
# down, say) does not spin the loop hot against it.
_FAILURE_BACKOFF_SECONDS = (1, 2, 5, 10, 15, 30)
# Pause before the supervisor rebuilds a loop that exited.
_SUPERVISOR_RESTART_SECONDS = 5


def _backoff_seconds(consecutive_failures: int) -> int:
    index = min(consecutive_failures, len(_FAILURE_BACKOFF_SECONDS)) - 1
    return _FAILURE_BACKOFF_SECONDS[max(index, 0)]


def _settle_interrupted_rounds(engine) -> None:
    """Rounds a restart left open still hold players' stakes. Betting on them is
    over, so they are drawn and settled like any other round."""
    from ..models.game import GameRound, GameRoundStatus
    from ..models.game_catalog import Game

    db = SessionLocal()
    try:
        game = db.query(Game).filter(Game.slug == engine.slug).first()
        if game is None:
            return
        stale = (
            db.query(GameRound.id)
            .filter(
                GameRound.game_id == game.id,
                GameRound.status.in_([GameRoundStatus.BETTING, GameRoundStatus.CALCULATING]),
            )
            .all()
        )
        for (round_id,) in stale:
            try:
                engine.lock_round_for_calculation(db, round_id)
                engine.settle_round(db, round_id)
                logger.info("[%s] Settled round %s left open by a restart", engine.slug, round_id)
            except Exception as exc:
                db.rollback()
                logger.error("[%s] Could not settle interrupted round %s: %s", engine.slug, round_id, exc)
    finally:
        db.close()


async def _play_one_round(engine, broadcast_fn=None) -> None:
    """Run a single round through all three phases.

    Raises on any failure; the caller sweeps up whatever was left open and
    starts a fresh round.
    """
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

    await asyncio.sleep(engine.result_display_seconds)


async def _run_engine_for_game(engine, broadcast_fn=None):
    logger.info("Game engine started for %s", engine.slug)
    # A failing startup sweep must not stop rounds from opening; that would be
    # the very freeze this loop exists to prevent.
    try:
        _settle_interrupted_rounds(engine)
    except Exception:
        logger.exception("[%s] Startup sweep failed; opening rounds anyway", engine.slug)
    consecutive_failures = 0
    while True:
        try:
            await _play_one_round(engine, broadcast_fn)
            consecutive_failures = 0
        except asyncio.CancelledError:
            raise
        except Exception:
            consecutive_failures += 1
            logger.exception(
                "[%s] Round failed (%d in a row); recovering",
                engine.slug,
                consecutive_failures,
            )
            # Whatever the failed round left in BETTING/CALCULATING still holds
            # players' stakes, and would freeze the table until the next
            # deploy. Draw and settle it before opening a new round.
            try:
                _settle_interrupted_rounds(engine)
            except Exception:
                logger.exception("[%s] Recovery sweep failed", engine.slug)
            await asyncio.sleep(_backoff_seconds(consecutive_failures))


async def _supervise(engine, broadcast_fn=None):
    """Last line of defence: restart the round loop if it ever exits.

    The loop above should run forever, so reaching here at all is a bug worth
    shouting about — but a frozen table is worse than a noisy log.
    """
    while True:
        try:
            await _run_engine_for_game(engine, broadcast_fn)
            logger.error("[%s] Round loop returned unexpectedly; restarting", engine.slug)
        except asyncio.CancelledError:
            logger.info("[%s] Round loop cancelled", engine.slug)
            raise
        except Exception:
            logger.exception("[%s] Round loop crashed; restarting", engine.slug)
        await asyncio.sleep(_SUPERVISOR_RESTART_SECONDS)


def start_engine(broadcast_fn=None):
    global _engine_tasks
    if _engine_tasks and any(not t.done() for t in _engine_tasks):
        logger.warning("Game engine already running")
        return
    _engine_tasks = [
        asyncio.create_task(_supervise(engine, broadcast_fn))
        for engine in list_engines()
    ]
    logger.info("Game engine tasks created: %d", len(_engine_tasks))


def stop_engine():
    global _engine_tasks
    for task in _engine_tasks:
        task.cancel()
    _engine_tasks = []
    logger.info("Game engine tasks cancelled")
