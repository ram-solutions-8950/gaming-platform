"""The round scheduler must leave each game's result on screen before opening the next round."""
import asyncio
from types import SimpleNamespace

import pytest

from app.services import game_engine
from app.services.game_engines import get_engine


class _StopLoop(Exception):
    pass


def _pause_after_result(engine) -> float:
    """Run one round of the scheduler loop and return the pause after round_result."""
    rnd = SimpleNamespace(id="r1", game_id="g1", started_at=None, betting_closes_at=None,
                          result_color=None, result_number=None, result_data={})
    rnd.started_at = rnd.betting_closes_at = SimpleNamespace(isoformat=lambda: "t")
    fake = SimpleNamespace(
        slug=engine.slug,
        result_display_seconds=engine.result_display_seconds,
        create_round=lambda db: rnd,
        get_betting_duration_seconds=lambda db: 15,
        get_round_duration_seconds=lambda db: 18,
        lock_round_for_calculation=lambda db, rid: rnd,
        settle_round=lambda db, rid: rnd,
    )
    messages, sleeps = [], []

    async def broadcast(msg):
        messages.append(msg["type"])

    async def sleep(seconds):
        sleeps.append((seconds, list(messages)))
        if messages[-1] == "round_result":
            raise _StopLoop

    original = game_engine.asyncio, game_engine.SessionLocal
    game_engine.asyncio = SimpleNamespace(sleep=sleep)
    game_engine.SessionLocal = lambda: SimpleNamespace(close=lambda: None)
    try:
        with pytest.raises(_StopLoop):
            asyncio.run(game_engine._run_engine_for_game(fake, broadcast))
    finally:
        game_engine.asyncio, game_engine.SessionLocal = original

    seconds, sent_before = sleeps[-1]
    assert sent_before == ["round_start", "betting_locked", "round_result"]
    return seconds


def test_dragon_tiger_holds_the_result_before_the_next_round():
    # Card reveal + 3.5s card hold + 3s winner popup on the client take 7.75s
    assert _pause_after_result(get_engine("dragon-tiger")) >= 7.75


def test_other_games_keep_their_short_pause():
    assert _pause_after_result(get_engine("andar-bahar")) == 1
    assert _pause_after_result(get_engine("colour-prediction")) == 1
