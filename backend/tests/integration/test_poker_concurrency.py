"""Covers the poker table lock introduced with the event-loop rework.

Poker's engine state lives in memory and has no internal locking. It used to
rely on the event loop being single-threaded, but that never covered
multi-step sequences: ``run_bot_turns`` already awaited between actions. Moving
the blocking database work into worker threads added more await points, so
every mutating sequence now runs under a per-table ``asyncio.Lock``.

The lock is the risky part of that change, not the offloading: it is not
reentrant, the handlers call into each other, and it guards code holding real
chips. These tests pin the three properties that make it safe --

1. no sequence deadlocks (a nested acquire would wedge a table permanently),
2. a human action cannot interleave with a hand being dealt,
3. the lock is released across bot think time and the settlement cooldown, so
   one player's pause never becomes everyone's.
"""
from __future__ import annotations

import asyncio

import pytest

import app.websocket.poker_ws as poker_ws
from app.services.poker.engine import PokerEngine


@pytest.fixture(autouse=True)
def quiet_table(monkeypatch):
    """No sockets, no database, no real waiting."""
    sent: list[tuple[str, dict]] = []

    async def record(table_id, user_id, payload):
        sent.append((user_id, payload))

    def no_persist(*args, **kwargs):
        return None

    monkeypatch.setattr(poker_ws.poker_ws_manager, "send_to_user", record)
    monkeypatch.setattr(poker_ws, "_persist_hand", no_persist)
    monkeypatch.setattr(poker_ws, "_SETTLEMENT_COOLDOWN_SECONDS", 0)
    monkeypatch.setattr(poker_ws, "_BOT_THINK_SECONDS", (0, 0))
    return sent


@pytest.fixture(autouse=True)
def clear_locks():
    poker_ws._table_locks.clear()
    poker_ws._bot_turns_active.clear()
    yield
    poker_ws._table_locks.clear()
    poker_ws._bot_turns_active.clear()


def _practice_table(table_id: str, humans: int = 1, bots: int = 2) -> PokerEngine:
    engine = PokerEngine(table_id, is_practice=True, small_blind=100, big_blind=200)
    for i in range(humans):
        engine.add_player(f"human{i}", f"Human {i}", 5000)
    for i in range(bots):
        engine.add_player(f"bot{i}", f"Bot {i}", 5000, is_bot=True)
    return engine


def test_dealing_a_hand_through_the_lock_does_not_deadlock():
    """on_seat_taken -> deal_next_hand_locked -> tidy_seats_locked.

    Every one of those awaits the next while the lock is held. If any of them
    acquired it again this would hang rather than fail.
    """
    engine = _practice_table("deadlock-probe")

    async def scenario():
        await asyncio.wait_for(poker_ws.on_seat_taken(engine), timeout=5)
        # Released again, or nothing else at this table could ever proceed.
        assert not poker_ws.table_lock(engine.table_id).locked()

    asyncio.run(scenario())
    assert engine.phase == 'PRE_FLOP'


def test_a_full_bot_driven_hand_completes_without_deadlocking():
    """run_bot_turns takes the lock per step, including around settlement."""
    engine = _practice_table("bot-loop-probe", humans=0, bots=2)
    engine.start_hand()

    async def scenario():
        await asyncio.wait_for(poker_ws.run_bot_turns(engine), timeout=15)

    asyncio.run(scenario())
    assert not poker_ws.table_lock(engine.table_id).locked()
    # The guard must be cleared too, or no later hand at this table would run.
    assert engine.table_id not in poker_ws._bot_turns_active
    assert engine.phase in ('WAITING', 'SETTLEMENT')


def test_the_lock_serialises_two_sequences_on_the_same_table():
    """A second sequence waits rather than seeing the table mid-change."""
    engine = _practice_table("serialise-probe")
    lock = poker_ws.table_lock(engine.table_id)
    order: list[str] = []

    async def holder():
        async with lock:
            order.append("first-in")
            await asyncio.sleep(0.05)
            order.append("first-out")

    async def contender():
        await asyncio.sleep(0.01)  # make sure holder goes first
        async with lock:
            order.append("second-in")

    async def scenario():
        await asyncio.wait_for(asyncio.gather(holder(), contender()), timeout=5)

    asyncio.run(scenario())

    assert order == ["first-in", "first-out", "second-in"], (
        "the second sequence ran inside the first one's critical section"
    )


def test_the_lock_is_released_across_bot_think_time(monkeypatch):
    """A human's action must not queue behind a bot's pause.

    Holding the lock through the think time (or the four-second settlement
    cooldown) would make a fold wait for the bots, which is exactly the stall
    the rework is meant to remove.
    """
    # A think time much longer than the probe window, so that "the lock was
    # free" cannot be satisfied by a brief gap between two holds.
    think = 0.6
    probe_timeout = 0.2
    monkeypatch.setattr(poker_ws, "_BOT_THINK_SECONDS", (think, think))
    engine = _practice_table("release-probe", humans=0, bots=2)
    engine.start_hand()

    acquired_during_think = False

    async def scenario():
        nonlocal acquired_during_think
        bots = asyncio.create_task(poker_ws.run_bot_turns(engine))
        await asyncio.sleep(0.1)  # we are now well inside a bot's think time
        lock = poker_ws.table_lock(engine.table_id)
        try:
            # The probe window closes long before the bot stops thinking, so
            # holding the lock across the pause makes this time out.
            await asyncio.wait_for(lock.acquire(), timeout=probe_timeout)
            acquired_during_think = True
            lock.release()
        except asyncio.TimeoutError:
            acquired_during_think = False
        bots.cancel()
        try:
            await bots
        except asyncio.CancelledError:
            pass

    asyncio.run(scenario())
    assert acquired_during_think, (
        "the table lock was held across a bot's think time; every other player "
        "at the table would be blocked for the duration"
    )


def test_a_rejected_action_still_releases_the_lock():
    """An error path must not leave the table wedged."""
    engine = _practice_table("error-probe")

    async def scenario():
        lock = poker_ws.table_lock(engine.table_id)
        with pytest.raises(RuntimeError):
            async with lock:
                raise RuntimeError("boom")
        assert not lock.locked()
        # The table must still be usable.
        await asyncio.wait_for(poker_ws.on_seat_taken(engine), timeout=5)

    asyncio.run(scenario())
    assert engine.phase == 'PRE_FLOP'


def test_concurrent_bot_loops_do_not_both_run():
    """Two nudges must not drive the same table twice over."""
    engine = _practice_table("single-loop-probe", humans=0, bots=2)
    engine.start_hand()

    async def scenario():
        await asyncio.wait_for(
            asyncio.gather(
                poker_ws.run_bot_turns(engine),
                poker_ws.run_bot_turns(engine),
                poker_ws.run_bot_turns(engine),
            ),
            timeout=15,
        )

    asyncio.run(scenario())
    assert engine.table_id not in poker_ws._bot_turns_active
    assert not poker_ws.table_lock(engine.table_id).locked()


def test_each_table_gets_its_own_lock():
    """One busy table must never stall a different one."""
    a = poker_ws.table_lock("table-a")
    b = poker_ws.table_lock("table-b")
    assert a is not b
    assert poker_ws.table_lock("table-a") is a  # and it is stable per table

    async def scenario():
        async with a:
            # A different table is unaffected.
            await asyncio.wait_for(b.acquire(), timeout=0.5)
            b.release()

    asyncio.run(scenario())
