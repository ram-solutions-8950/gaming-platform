"""The round scheduler must leave each game's result on screen before opening the next round."""
import asyncio
from types import SimpleNamespace

import pytest

from app.services import game_engine
from app.services.game_engines import get_engine


class _StopLoop(Exception):
    pass


def _fake_round():
    rnd = SimpleNamespace(id="r1", game_id="g1", started_at=None, betting_closes_at=None,
                          result_color=None, result_number=None, result_data={})
    rnd.started_at = rnd.betting_closes_at = SimpleNamespace(isoformat=lambda: "t")
    return rnd


def _pause_after_result(engine) -> float:
    """Run one round of the scheduler and return the pause after round_result.

    Drives _play_one_round rather than the supervising loop: the loop recovers
    from any Exception, so a sentinel raised to stop it would be swallowed.
    """
    rnd = _fake_round()
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
    game_engine.asyncio = SimpleNamespace(sleep=sleep, CancelledError=asyncio.CancelledError)
    query_mock = lambda *a: SimpleNamespace(filter=lambda *f: SimpleNamespace(first=lambda: None, all=list))
    game_engine.SessionLocal = lambda: SimpleNamespace(close=lambda: None, query=query_mock)
    try:
        with pytest.raises(_StopLoop):
            asyncio.run(game_engine._play_one_round(fake, broadcast))
    finally:
        game_engine.asyncio, game_engine.SessionLocal = original

    seconds, sent_before = sleeps[-1]
    assert sent_before == ["round_start", "betting_locked", "round_result"]
    return seconds


def test_dragon_tiger_holds_the_result_before_the_next_round():
    # Card reveal + 3.5s card hold + 3s winner popup on the client take 7.75s
    assert _pause_after_result(get_engine("dragon-tiger")) >= 7.75


def test_andar_bahar_holds_the_result_before_the_next_round():
    # Card reveal + dealing + winner popup on the client take >= 7.5s
    assert _pause_after_result(get_engine("andar-bahar")) >= 7.5


def test_other_games_keep_their_short_pause():
    assert _pause_after_result(get_engine("colour-prediction")) == 1


# --- resilience: a failed round must not take the table down with it ---------


def test_backoff_grows_then_caps():
    progression = [game_engine._backoff_seconds(n) for n in range(1, 9)]
    assert progression == [1, 2, 5, 10, 15, 30, 30, 30]


def _run_loop_with_rounds(round_outcomes):
    """Drive _run_engine_for_game over a scripted list of round outcomes.

    Each outcome is either None (the round succeeds) or an exception to raise.
    The loop is stopped with CancelledError once the script is exhausted,
    since the loop deliberately recovers from every ordinary Exception.
    """
    fake = SimpleNamespace(slug="colour-prediction")
    attempts, sweeps, backoffs = [], [], []
    remaining = list(round_outcomes)

    async def play_one_round(engine, broadcast_fn=None):
        if not remaining:
            raise asyncio.CancelledError
        outcome = remaining.pop(0)
        attempts.append(outcome)
        if outcome is not None:
            raise outcome

    async def sleep(seconds):
        backoffs.append(seconds)

    original = (game_engine.asyncio, game_engine._play_one_round,
                game_engine._settle_interrupted_rounds)
    game_engine.asyncio = SimpleNamespace(sleep=sleep, CancelledError=asyncio.CancelledError)
    game_engine._play_one_round = play_one_round
    game_engine._settle_interrupted_rounds = lambda engine: sweeps.append(engine.slug)
    try:
        with pytest.raises(asyncio.CancelledError):
            asyncio.run(game_engine._run_engine_for_game(fake))
    finally:
        (game_engine.asyncio, game_engine._play_one_round,
         game_engine._settle_interrupted_rounds) = original

    return attempts, sweeps, backoffs


def test_loop_recovers_and_reopens_after_a_failed_round():
    attempts, sweeps, backoffs = _run_loop_with_rounds([RuntimeError("boom"), None])

    # The round after the failure still ran: the table did not freeze.
    assert len(attempts) == 2
    # Startup sweep, plus one recovery sweep that settles the stuck round.
    assert len(sweeps) == 2
    assert backoffs == [1]


def test_consecutive_failures_back_off_and_a_success_resets():
    _, _, backoffs = _run_loop_with_rounds(
        [RuntimeError("a"), RuntimeError("b"), RuntimeError("c"), None, RuntimeError("d")]
    )
    assert backoffs == [1, 2, 5, 1]


def test_recovery_survives_a_failing_sweep():
    """A sweep that itself fails must not escape and kill the loop."""
    fake = SimpleNamespace(slug="colour-prediction")
    attempts, backoffs = [], []
    remaining = [RuntimeError("boom"), None]

    async def play_one_round(engine, broadcast_fn=None):
        if not remaining:
            raise asyncio.CancelledError
        outcome = remaining.pop(0)
        attempts.append(outcome)
        if outcome is not None:
            raise outcome

    async def sleep(seconds):
        backoffs.append(seconds)

    def failing_sweep(engine):
        raise RuntimeError("sweep exploded")

    original = (game_engine.asyncio, game_engine._play_one_round,
                game_engine._settle_interrupted_rounds)
    game_engine.asyncio = SimpleNamespace(sleep=sleep, CancelledError=asyncio.CancelledError)
    game_engine._play_one_round = play_one_round
    game_engine._settle_interrupted_rounds = failing_sweep
    try:
        with pytest.raises(asyncio.CancelledError):
            asyncio.run(game_engine._run_engine_for_game(fake))
    finally:
        (game_engine.asyncio, game_engine._play_one_round,
         game_engine._settle_interrupted_rounds) = original

    assert len(attempts) == 2


def test_supervisor_restarts_a_loop_that_returns():
    """The loop should never return; if it does, the supervisor rebuilds it."""
    fake = SimpleNamespace(slug="colour-prediction")
    starts, sleeps = [], []

    async def run_engine(engine, broadcast_fn=None):
        starts.append(engine.slug)
        if len(starts) >= 3:
            raise asyncio.CancelledError
        # falls off the end: the loop "returns unexpectedly"

    async def sleep(seconds):
        sleeps.append(seconds)

    original = game_engine.asyncio, game_engine._run_engine_for_game
    game_engine.asyncio = SimpleNamespace(sleep=sleep, CancelledError=asyncio.CancelledError)
    game_engine._run_engine_for_game = run_engine
    try:
        with pytest.raises(asyncio.CancelledError):
            asyncio.run(game_engine._supervise(fake))
    finally:
        game_engine.asyncio, game_engine._run_engine_for_game = original

    assert len(starts) == 3
    assert sleeps == [game_engine._SUPERVISOR_RESTART_SECONDS] * 2
