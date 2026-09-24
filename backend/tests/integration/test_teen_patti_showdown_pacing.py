"""
End-of-hand pacing for Teen Patti: a show reveals both hands (SHOWDOWN) for a
fixed hold before the result is announced (FINISHED) and the next hand is dealt.
"""
import asyncio
import time

from app.services.teen_patti.cards import Card
from app.services.teen_patti.engine import GameConfig, Phase, TeenPattiHand
from app.services.teen_patti.manager import teen_patti_manager
import app.websocket.teen_patti_ws as tpws


def _cards(*specs):
    ranks = {"J": 11, "Q": 12, "K": 13, "A": 14}
    return [Card(ranks.get(s[:-1]) or int(s[:-1]), s[-1]) for s in specs]


def _shown_hand(seat_ids):
    """A hand that has just been decided by a show: seat 0 (Trail of Aces) beats seat 1."""
    hand = TeenPattiHand(GameConfig(boot_amount=100, max_players=len(seat_ids)))
    for sid in seat_ids:
        hand.add_seat(sid, sid)
    hand.start_hand(client_seed="pacing", nonce=1)
    hand.seats[0].cards = _cards("AH", "AD", "AS")
    hand.seats[1].cards = _cards("KH", "KD", "KS")
    for s in hand.seats:
        s.seen = True
    hand.show(hand.seats[hand.current_turn].id)
    return hand


def test_show_holds_both_hands_face_up_until_completed():
    hand = _shown_hand(["p1", "p2"])

    assert hand.phase == Phase.SHOWDOWN
    assert hand.winner_seat == 0
    # Everyone, including a spectator, sees both hands during the reveal
    for seat in hand.as_dict(for_user_id=None)["seats"]:
        assert seat["cards"] is not None and len(seat["cards"]) == 3

    hand.complete_showdown()
    assert hand.phase == Phase.FINISHED

    # A fold win has nothing to reveal and is final straight away
    fold = TeenPattiHand(GameConfig(boot_amount=100, max_players=2))
    fold.add_seat("p1", "p1")
    fold.add_seat("p2", "p2")
    fold.start_hand(client_seed="fold", nonce=1)
    fold.pack(fold.seats[fold.current_turn].id)
    assert fold.phase == Phase.FINISHED


def test_reveal_then_result_then_next_hand(monkeypatch):
    table_id = "pacing-order"
    hand = _shown_hand(["bot_a", "bot_b"])
    teen_patti_manager._games[table_id] = hand

    timeline = []
    t0 = time.monotonic()

    async def record_broadcast(tid):
        timeline.append(("broadcast", hand.phase, time.monotonic() - t0))

    async def record_deal(tid):
        timeline.append(("deal", hand.phase, time.monotonic() - t0))

    monkeypatch.setattr(tpws, "_broadcast_state", record_broadcast)
    monkeypatch.setattr(tpws, "_start_hand", record_deal)
    monkeypatch.setattr(tpws, "_SHOWDOWN_REVEAL_SECONDS", 0.3)
    monkeypatch.setattr(tpws, "_NEXT_HAND_DELAY_SECONDS", 0.3)
    try:
        asyncio.run(tpws._schedule_next_hand(table_id))
    finally:
        teen_patti_manager.remove(table_id)

    (kind1, phase1, at1), (kind2, _, at2) = timeline
    # The result is only announced once the reveal has run its full length...
    assert (kind1, phase1) == ("broadcast", Phase.FINISHED)
    assert at1 >= 0.3
    # ...and the next hand only after the result has been up for its full length
    assert kind2 == "deal"
    assert at2 - at1 >= 0.3


def test_start_cannot_cut_the_reveal_short(monkeypatch):
    table_id = "pacing-start"
    hand = _shown_hand(["p1", "p2"])
    teen_patti_manager._games[table_id] = hand
    monkeypatch.setattr(tpws, "_load_config", lambda tid: (hand.config, "free"))
    try:
        asyncio.run(tpws._handle_action(table_id, "p2", {"action": "start", "action_id": "deal-now"}))
    finally:
        teen_patti_manager.remove(table_id)

    assert hand.phase == Phase.SHOWDOWN
    assert hand.winner_seat == 0


def test_leaving_after_the_hand_keeps_the_table_dealing():
    table_id = "pacing-leave"
    hand = TeenPattiHand(GameConfig(boot_amount=100, max_players=3))
    for sid in ("bot_a", "bot_b", "human"):
        hand.add_seat(sid, sid)
    hand.start_hand(client_seed="leave", nonce=1)
    while hand.phase == Phase.PLAYING:
        hand.pack(hand.seats[hand.current_turn].id)
    assert hand.phase == Phase.FINISHED
    teen_patti_manager._games[table_id] = hand

    async def scenario():
        await tpws._handle_player_leave(table_id, "human")
        task = tpws._start_timers.get(table_id)
        # Two players remain, so the next-hand timer must still be running
        assert task is not None and not task.done()
        task.cancel()

    try:
        asyncio.run(scenario())
    finally:
        teen_patti_manager.remove(table_id)
        tpws._start_timers.pop(table_id, None)
