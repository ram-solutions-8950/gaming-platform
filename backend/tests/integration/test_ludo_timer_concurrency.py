"""Covers the Ludo turn-timer loop after its event-loop rework.

The timer used to query Postgres once a second directly on the event loop,
which stalled every other match and every HTTP request for the duration of the
query -- and the queries it made were behind the same wallet row locks that a
settlement takes.

It also had a correctness bug of exactly the kind this whole pass is about: the
session was opened *before* the match lock was taken, so the match row could
already be loaded, and SQLAlchemy's identity map would hand the timeout check
that cached instance. If a player rolled the dice on another session in the
meantime, the check saw a stale ``turn_started_at`` and timed out a player who
had in fact acted in time -- a lost turn, and after three of them a forfeited
match with real money on it.

The work now happens in ``_check_turn_timeout``, which opens its own session
inside the lock, so every tick reads committed state.
"""
from __future__ import annotations

import asyncio
import inspect
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.orm import sessionmaker

from app.models.ludo import (
    LudoColor,
    LudoMatch,
    LudoMatchmakingQueue,
    LudoMatchStatus,
    LudoPlayer,
    LudoToken,
)
from app.models.user import User, UserStatus
from app.models.wallet import Wallet
from app.websocket import ludo as ludo_ws
from app.websocket.ludo import _check_turn_timeout, ludo_ws_manager


@pytest.fixture(autouse=True)
def fresh_manager_state():
    """The manager is a singleton; its locks would otherwise stay bound to an
    event loop that a previous test has already closed."""
    ludo_ws_manager.locks.clear()
    ludo_ws_manager.timer_tasks.clear()
    ludo_ws_manager.rooms.clear()
    yield
    ludo_ws_manager.locks.clear()
    ludo_ws_manager.timer_tasks.clear()
    ludo_ws_manager.rooms.clear()


@pytest.fixture(autouse=True)
def use_test_database(db, monkeypatch):
    """`_check_turn_timeout` opens its own session, which by default is the
    application's -- pointed at the development database, not this test one."""
    monkeypatch.setattr(
        ludo_ws,
        "SessionLocal",
        sessionmaker(autocommit=False, autoflush=False, bind=db.get_bind()),
    )


@pytest.fixture(autouse=True)
def clean_ludo_tables(db):
    for model in (LudoToken, LudoPlayer, LudoMatchmakingQueue, LudoMatch):
        db.query(model).delete()
    db.commit()
    yield
    for model in (LudoToken, LudoPlayer, LudoMatchmakingQueue, LudoMatch):
        db.query(model).delete()
    db.commit()


@pytest.fixture
def live_match(db):
    """An in-progress two-player match whose turn clock started just now."""
    players = []
    for i in range(2):
        uid = uuid.uuid4()
        db.add(User(
            id=uid,
            name=f"Timer Player {i}",
            username=f"ludo_timer_{i}_{uid.hex[:6]}",
            email=f"ludo_timer_{i}_{uid.hex[:6]}@test.com",
            password_hash="hash",
            status=UserStatus.ACTIVE,
        ))
        db.add(Wallet(id=uuid.uuid4(), user_id=uid, balance=100_000))
        players.append(uid)

    match = LudoMatch(
        id=uuid.uuid4(),
        status=LudoMatchStatus.IN_PROGRESS,
        current_turn_color=LudoColor.RED,
        turn_timeout_seconds=10,
        turn_started_at=datetime.now(timezone.utc),
        entry_fee=0,
        prize_pool=0,
    )
    db.add(match)
    db.flush()
    for i, (uid, color) in enumerate(zip(players, (LudoColor.RED, LudoColor.GREEN))):
        db.add(LudoPlayer(
            id=uuid.uuid4(),
            match_id=match.id,
            user_id=uid,
            color=color,
            seat_index=i,
        ))
    db.commit()
    return match


def _set_turn_started(db, match, seconds_ago: float):
    match.turn_started_at = datetime.now(timezone.utc) - timedelta(seconds=seconds_ago)
    db.commit()


def test_a_turn_still_inside_its_clock_is_not_timed_out(db, live_match):
    outcome = _check_turn_timeout(live_match.id)
    assert outcome == {"stop": False, "result": None, "state": None}


def test_an_expired_turn_is_timed_out(db, live_match):
    _set_turn_started(db, live_match, seconds_ago=30)

    outcome = _check_turn_timeout(live_match.id)

    assert outcome["stop"] is False
    assert outcome["result"] is not None
    assert outcome["result"]["status"] == "TIMEOUT"
    assert outcome["state"] is not None


def test_each_tick_reads_committed_state_rather_than_a_cached_row(db, live_match):
    """Every tick re-reads the clock, so one timeout does not imply the next.

    This pins freshness *between* ticks. The sharper race -- a roll committing
    while a tick waits for the match lock -- is covered by
    ``test_a_roll_committed_while_the_tick_waits_for_the_lock_is_respected``.
    """
    # Tick one: the clock has run out.
    _set_turn_started(db, live_match, seconds_ago=30)
    first = _check_turn_timeout(live_match.id)
    assert first["result"] is not None and first["result"]["status"] == "TIMEOUT"

    # The player now acts, on a different session, resetting their clock.
    _set_turn_started(db, live_match, seconds_ago=0)

    # Tick two must see that commit and leave them alone.
    second = _check_turn_timeout(live_match.id)
    assert second["result"] is None, (
        "the timer worked from a cached match row: a player who acted in time "
        "was timed out anyway"
    )


def test_a_finished_match_stops_the_timer(db, live_match):
    live_match.status = LudoMatchStatus.COMPLETED
    db.commit()

    outcome = _check_turn_timeout(live_match.id)

    assert outcome["stop"] is True, "the timer loop would spin forever on a finished match"


def test_a_missing_match_stops_the_timer(db):
    outcome = _check_turn_timeout(uuid.uuid4())
    assert outcome["stop"] is True


def test_the_timeout_check_is_synchronous_so_it_can_be_offloaded():
    """It is handed to `in_thread`, which runs sync callables only."""
    assert not inspect.iscoroutinefunction(_check_turn_timeout)
    assert "SessionLocal" in inspect.getsource(_check_turn_timeout), (
        "the check must open its own session inside the lock, not accept one "
        "opened earlier"
    )


def test_the_timer_loop_holds_the_match_lock_while_it_checks(db, live_match, monkeypatch):
    """Otherwise a roll could commit between the check and the timeout."""
    match_id = str(live_match.id)
    held_during_check: list[bool] = []

    def spy(match_uuid):
        held_during_check.append(ludo_ws_manager.get_lock(match_id).locked())
        return {"stop": True, "result": None, "state": None}

    monkeypatch.setattr(ludo_ws, "_check_turn_timeout", spy)

    async def scenario():
        await asyncio.wait_for(ludo_ws_manager._match_timer_loop(match_id), timeout=10)

    asyncio.run(scenario())

    assert held_during_check == [True], (
        "the timer checked the turn clock without holding the match lock"
    )
    # And it must give the lock back, or no roll would ever be accepted again.
    assert not ludo_ws_manager.get_lock(match_id).locked()


def test_a_roll_committed_while_the_tick_waits_for_the_lock_is_respected(
    db, live_match, monkeypatch
):
    """The exact window the old implementation read through.

    It opened a session and loaded the match *before* acquiring the match
    lock. A dice roll committing on another session while it waited left it
    holding an identity-mapped row with the old ``turn_started_at``, so it
    timed out a player who had just acted -- and three of those forfeit the
    match and pay out its prize pool.

    Here the tick is deliberately made to wait on the lock while the roll
    commits. Because the session is now opened inside the lock, the tick reads
    the committed clock and does nothing.
    """
    match_id = str(live_match.id)
    _set_turn_started(db, live_match, seconds_ago=30)  # the clock has run out

    broadcasts: list[dict] = []

    async def record(mid, message):
        broadcasts.append(message)

    monkeypatch.setattr(ludo_ws_manager, "broadcast", record)

    async def scenario():
        lock = ludo_ws_manager.get_lock(match_id)
        await lock.acquire()  # the tick will block here
        loop_task = asyncio.create_task(ludo_ws_manager._match_timer_loop(match_id))
        try:
            # The loop sleeps a second before its first check, then waits on us.
            await asyncio.sleep(1.3)

            # The player gets their roll in, on a different session.
            _set_turn_started(db, live_match, seconds_ago=0)

            lock.release()
            await asyncio.sleep(0.4)  # let the tick run now that it can
        finally:
            loop_task.cancel()
            try:
                await loop_task
            except asyncio.CancelledError:
                pass

    asyncio.run(scenario())

    timeouts = [m for m in broadcasts if m.get("type") == "TIMEOUT"]
    assert not timeouts, (
        "a player who rolled while the tick waited for the lock was timed out "
        "anyway: the turn clock was read before the lock was held"
    )
