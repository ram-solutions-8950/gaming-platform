import asyncio
import time
from unittest.mock import MagicMock

import pytest
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from app.models.user import User, UserRole, UserStatus
from app.models.wallet import Wallet
from app.security.password import hash_password
from app.services.wallet_service import get_balance
from app.services.poker.cards import Card, Deck
from app.services.poker.hand_rank import HandCategory
from app.services.poker.evaluator import evaluate_5card_hand, evaluate_best_hand
from app.services.poker.engine import PokerEngine
import app.websocket.poker_ws as poker_ws

def test_deck_creation_and_shuffle():
    deck = Deck()
    assert len(deck.cards) == 52
    deck.shuffle()
    assert len(deck.cards) == 52
    dealt = deck.deal(5)
    assert len(dealt) == 5
    assert len(deck.cards) == 47

def test_hand_evaluator_royal_flush():
    cards = [Card.from_str(c) for c in ["AH", "KH", "QH", "JH", "10H"]]
    hand = evaluate_5card_hand(cards)
    assert hand.category == HandCategory.ROYAL_FLUSH

def test_hand_evaluator_straight_flush():
    cards = [Card.from_str(c) for c in ["9S", "8S", "7S", "6S", "5S"]]
    hand = evaluate_5card_hand(cards)
    assert hand.category == HandCategory.STRAIGHT_FLUSH

def test_hand_evaluator_four_of_a_kind():
    cards = [Card.from_str(c) for c in ["KD", "KC", "KS", "KH", "2D"]]
    hand = evaluate_5card_hand(cards)
    assert hand.category == HandCategory.FOUR_OF_A_KIND

def test_hand_evaluator_full_house():
    cards = [Card.from_str(c) for c in ["QC", "QD", "QS", "8H", "8C"]]
    hand = evaluate_5card_hand(cards)
    assert hand.category == HandCategory.FULL_HOUSE

def test_hand_evaluator_flush():
    cards = [Card.from_str(c) for c in ["AD", "JD", "8D", "5D", "3D"]]
    hand = evaluate_5card_hand(cards)
    assert hand.category == HandCategory.FLUSH

def test_hand_evaluator_straight_ace_high():
    cards = [Card.from_str(c) for c in ["AH", "KD", "QC", "JS", "10D"]]
    hand = evaluate_5card_hand(cards)
    assert hand.category == HandCategory.STRAIGHT
    assert hand.score_tuple[1] == 14

def test_hand_evaluator_straight_ace_low_wheel():
    cards = [Card.from_str(c) for c in ["AH", "5D", "4C", "3S", "2D"]]
    hand = evaluate_5card_hand(cards)
    assert hand.category == HandCategory.STRAIGHT
    assert hand.score_tuple[1] == 5

def test_hand_evaluator_three_of_a_kind():
    cards = [Card.from_str(c) for c in ["7H", "7D", "7C", "KS", "2D"]]
    hand = evaluate_5card_hand(cards)
    assert hand.category == HandCategory.THREE_OF_A_KIND

def test_hand_evaluator_two_pair():
    cards = [Card.from_str(c) for c in ["JH", "JD", "4C", "4S", "9D"]]
    hand = evaluate_5card_hand(cards)
    assert hand.category == HandCategory.TWO_PAIR

def test_hand_evaluator_one_pair():
    cards = [Card.from_str(c) for c in ["10H", "10D", "AC", "8S", "2D"]]
    hand = evaluate_5card_hand(cards)
    assert hand.category == HandCategory.ONE_PAIR

def test_hand_evaluator_best_from_seven():
    hole = [Card.from_str(c) for c in ["AH", "KH"]]
    community = [Card.from_str(c) for c in ["QH", "JH", "10H", "2C", "3D"]]
    hand = evaluate_best_hand(hole + community)
    assert hand.category == HandCategory.ROYAL_FLUSH

def test_poker_engine_multiplayer_seating():
    engine = PokerEngine("test_table_1", small_blind=100, big_blind=200)
    ok, _ = engine.add_player("user_1", "Player 1", 2000)
    assert ok
    ok, _ = engine.add_player("user_2", "Player 2", 2000)
    assert ok
    assert len(engine.players) == 2

def test_poker_engine_hand_start_and_blinds():
    engine = PokerEngine("test_table_2", small_blind=100, big_blind=200)
    engine.add_player("user_1", "Player 1", 2000)
    engine.add_player("user_2", "Player 2", 2000)
    ok, msg = engine.start_hand()
    assert ok
    assert engine.phase == 'PRE_FLOP'
    assert len(engine.community_cards) == 0
    assert engine.pot == 300  # 100 SB + 200 BB

def test_poker_engine_private_hole_card_security():
    engine = PokerEngine("test_table_3", small_blind=100, big_blind=200)
    engine.add_player("user_1", "Player 1", 2000)
    engine.add_player("user_2", "Player 2", 2000)
    engine.start_hand()

    state_for_u1 = engine.get_public_state(for_user_id="user_1")
    p1 = next(p for p in state_for_u1["players"] if p["user_id"] == "user_1")
    p2 = next(p for p in state_for_u1["players"] if p["user_id"] == "user_2")

    assert p1["hole_cards"] is not None
    assert len(p1["hole_cards"]) == 2
    assert p2["hole_cards"] is None  # Opponent cards MUST be hidden (null)

def test_poker_engine_out_of_turn_action_rejection():
    engine = PokerEngine("test_table_4", small_blind=100, big_blind=200)
    engine.add_player("user_1", "Player 1", 2000)
    engine.add_player("user_2", "Player 2", 2000)
    engine.start_hand()

    active_turn_seat = engine.current_turn_seat_idx
    non_turn_player = next(p for p in engine.players if p.seat_index != active_turn_seat)

    pot_before = engine.pot
    stack_before = non_turn_player.stack

    ok, err = engine.process_action(non_turn_player.user_id, "call")
    assert not ok
    assert "Not your turn" in err
    assert engine.pot == pot_before
    assert non_turn_player.stack == stack_before

def test_poker_engine_full_hand_flow():
    engine = PokerEngine("test_table_5", small_blind=100, big_blind=200)
    engine.add_player("u1", "P1", 2000)
    engine.add_player("u2", "P2", 2000)
    engine.start_hand()

    def act(action):
        user = next(p.user_id for p in engine.players if p.seat_index == engine.current_turn_seat_idx)
        ok, msg = engine.process_action(user, action)
        assert ok, msg
        return user

    # Pre-flop: the small blind completes, the big blind takes its option
    act("call")
    act("check")
    assert engine.phase == 'FLOP'
    assert len(engine.community_cards) == 3

    # Every later street needs BOTH players to act before it closes
    for street, cards in (('FLOP', 3), ('TURN', 4), ('RIVER', 5)):
        assert engine.phase == street
        first = act("check")
        assert engine.phase == street, f"{street} closed after one check"
        second = act("check")
        assert second != first

    assert engine.phase == 'SETTLEMENT'
    assert len(engine.community_cards) == 5
    assert len(engine.winners_summary) >= 1
    assert sum(p.stack for p in engine.players) == 4000  # no chips created or lost


def test_poker_no_duplicate_cards():
    engine = PokerEngine("test_table_6", small_blind=100, big_blind=200)
    engine.add_player("u1", "P1", 2000)
    engine.add_player("u2", "P2", 2000)
    engine.start_hand()

    all_cards = []
    for p in engine.players:
        all_cards.extend([c.to_str() for c in p.hole_cards])

    engine.phase = 'RIVER'
    engine.community_cards = engine.deck.deal(5)
    all_cards.extend([c.to_str() for c in engine.community_cards])

    assert len(all_cards) == len(set(all_cards))  # 0 duplicate cards!

def test_poker_all_in_and_side_pots():
    engine = PokerEngine("test_table_7", small_blind=100, big_blind=200)
    engine.add_player("u1", "ShortStack", 500)
    engine.add_player("u2", "BigStack1", 5000)
    engine.add_player("u3", "BigStack2", 5000)
    engine.start_hand()

    # Force all-in scenario
    u1_p = engine.get_player_by_id("u1")
    ok, _ = engine.process_action("u1", "all_in")
    assert ok or engine.phase != 'WAITING'

def test_poker_resync_and_security():
    engine = PokerEngine("test_table_8", small_blind=100, big_blind=200)
    engine.add_player("u1", "P1", 2000)
    engine.add_player("u2", "P2", 2000)
    engine.start_hand()

    # Reconnect user 2
    state_resync = engine.get_public_state(for_user_id="u2")
    assert state_resync["phase"] == 'PRE_FLOP'
    assert state_resync["pot"] == 300
    p2 = next(p for p in state_resync["players"] if p["user_id"] == "u2")
    p1 = next(p for p in state_resync["players"] if p["user_id"] == "u1")
    assert p2["hole_cards"] is not None
    assert p1["hole_cards"] is None  # Opponent cards MUST be hidden!

def _player_to_act(engine):
    return next(p for p in engine.players if p.seat_index == engine.current_turn_seat_idx)

def _run_bot_turns_fast(monkeypatch, engine):
    async def skip_persist(*args, **kwargs):
        return None
    monkeypatch.setattr(poker_ws, "persist_hand_result", skip_persist)
    monkeypatch.setattr(poker_ws, "_SETTLEMENT_COOLDOWN_SECONDS", 0)
    monkeypatch.setattr(poker_ws, "_BOT_THINK_SECONDS", (0, 0))
    asyncio.run(asyncio.wait_for(poker_ws.run_bot_turns(engine, db=MagicMock()), timeout=10))

def test_poker_opponent_leaving_mid_hand_awards_pot_and_clears_table(monkeypatch):
    engine = PokerEngine("test_table_9", small_blind=100, big_blind=200)
    engine.add_player("u1", "P1", 2000)
    engine.add_player("u2", "P2", 2000)
    engine.start_hand()

    # u1 has 200 in, u2 raises to 400, then u2 leaves while u1 is to act
    if _player_to_act(engine).user_id == "u1":
        engine.process_action("u1", "call")
    engine.process_action("u2", "raise", 400)
    engine.remove_player("u2")

    assert engine.phase == 'SETTLEMENT'
    assert engine.get_player_by_id("u1").stack == 2400  # 1800 behind + the 600 pot

    # Nobody is left to deal to: the paid-out pot, bets and cards must leave the felt
    _run_bot_turns_fast(monkeypatch, engine)
    state = engine.get_public_state(for_user_id="u1")
    assert state["phase"] == 'WAITING'
    assert state["pot"] == 0
    assert state["current_high_bet"] == 0
    assert state["current_turn_seat_idx"] is None
    me = state["players"][0]
    assert me["stack"] == 2400
    assert me["current_bet"] == 0
    assert me["hole_cards"] is None

def test_poker_practice_table_stops_dealing_once_only_bots_remain(monkeypatch):
    engine = PokerEngine("test_table_10", is_practice=True, small_blind=100, big_blind=200)
    engine.add_player("human", "Human", 2000)
    for i in range(3):
        engine.add_player(f"bot_{i}", f"Bot {i}", 2000, is_bot=True)
    engine.start_hand()
    engine.remove_player("human")

    _run_bot_turns_fast(monkeypatch, engine)

    # The bots may finish the hand in progress but must not deal themselves new ones
    assert engine.hand_nonce == 1
    assert engine.phase == 'WAITING'
    assert engine.pot == 0

def _poker_user(client, db, email, username, password="PokerLeave@2026!"):
    user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if not user:
        user = User(
            name=username,
            username=username,
            email=email,
            password_hash=hash_password(password),
            role=UserRole.USER,
            status=UserStatus.ACTIVE,
        )
        db.add(user)
    else:
        user.password_hash = hash_password(password)
    db.commit()
    db.refresh(user)

    wallet = get_balance(db, user.id)
    if not wallet:
        db.add(Wallet(user_id=user.id, balance=50000))
    else:
        wallet.balance = 50000
    db.commit()

    resp = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200
    return user, resp.json()["data"]["access_token"]

def test_poker_cash_table_opponent_leaves_mid_hand(client, db, monkeypatch):
    # The poker socket opens its own sessions; keep them on the test database
    monkeypatch.setattr(poker_ws, "SessionLocal", sessionmaker(autocommit=False, autoflush=False, bind=db.get_bind()))
    monkeypatch.setattr(poker_ws, "_SETTLEMENT_COOLDOWN_SECONDS", 0.05)

    u1, token1 = _poker_user(client, db, "pokerleave1@example.com", "pokerleave1")
    u2, token2 = _poker_user(client, db, "pokerleave2@example.com", "pokerleave2")
    headers1 = {"Authorization": f"Bearer {token1}"}
    headers2 = {"Authorization": f"Bearer {token2}"}
    u1_id, u2_id = str(u1.id), str(u2.id)

    table = client.post("/api/v1/poker/tables", json={
        "name": "Leave Test", "is_practice": False, "small_blind": 100, "big_blind": 200,
        "min_buy_in": 2000, "max_buy_in": 20000,
    }, headers=headers1).json()
    table_id = table["id"]
    for headers in (headers1, headers2):
        assert client.post(f"/api/v1/poker/tables/{table_id}/join", json={"buy_in_amount": 2000}, headers=headers).status_code == 200

    def wait_for_state(ws, predicate):
        state = None
        for _ in range(200):
            ws.send_json({"action": "sync"})
            msg = ws.receive_json()
            while msg.get("type") != "sync":
                msg = ws.receive_json()
            state = msg["state"]
            if predicate(state):
                return state
            time.sleep(0.02)
        pytest.fail(f"Table never reached the expected state, last seen: {state}")

    ws_url = f"/api/v1/poker/ws/{table_id}"
    with client.websocket_connect(f"{ws_url}?token={token1}") as ws1, \
         client.websocket_connect(f"{ws_url}?token={token2}") as ws2:
        state = wait_for_state(ws1, lambda s: s["phase"] == "PRE_FLOP")
        seat_of = {p["user_id"]: p["seat_index"] for p in state["players"]}

        # u1 has 200 in, u2 raises to 400, then u2 leaves while u1 is to act
        if state["current_turn_seat_idx"] == seat_of[u1_id]:
            ws1.send_json({"action": "call"})
            wait_for_state(ws2, lambda s: s["current_turn_seat_idx"] == seat_of[u2_id])
        ws2.send_json({"action": "raise", "amount": 400})
        wait_for_state(ws1, lambda s: s["pot"] == 600 and s["current_turn_seat_idx"] == seat_of[u1_id])

        leave = client.post(f"/api/v1/poker/tables/{table_id}/leave", headers=headers2)
        assert leave.status_code == 200
        # The 1600 u2 never put in the pot goes back to their wallet
        assert leave.json()["returned_stack"] == 1600

        state = wait_for_state(ws1, lambda s: s["phase"] == "WAITING")
        assert [p["user_id"] for p in state["players"]] == [u1_id]
        assert state["pot"] == 0
        assert state["current_high_bet"] == 0
        me = state["players"][0]
        assert me["stack"] == 2400
        assert me["current_bet"] == 0
        assert me["hole_cards"] is None

    db.expire_all()
    assert get_balance(db, u2.id).balance == 50000 - 2000 + 1600


# ── Texas Hold'em rules ────────────────────────────────────────────────────────

def _table(*stacks, sb=100, bb=200):
    engine = PokerEngine("rules", small_blind=sb, big_blind=bb)
    for i, stack in enumerate(stacks):
        engine.add_player(f"p{i}", f"P{i}", stack)
    return engine


def _to_act(engine):
    return next(p for p in engine.players if p.seat_index == engine.current_turn_seat_idx)


def _act(engine, action, amount=0):
    player = _to_act(engine)
    ok, msg = engine.process_action(player.user_id, action, amount)
    assert ok, msg
    return player.user_id


def test_every_player_acts_on_every_street():
    engine = _table(2000, 2000, 2000)
    engine.start_hand()
    for _ in range(3):
        _act(engine, "call" if engine.current_high_bet > _to_act(engine).current_bet else "check")
    assert engine.phase == 'FLOP'
    acted = {_act(engine, "check"), _act(engine, "check")}
    assert engine.phase == 'FLOP'  # the third player still has to act
    acted.add(_act(engine, "check"))
    assert engine.phase == 'TURN' and len(acted) == 3


def test_a_raise_makes_everyone_act_again():
    engine = _table(2000, 2000, 2000)
    engine.start_hand()
    while engine.phase == 'PRE_FLOP':
        _act(engine, "call" if engine.current_high_bet > _to_act(engine).current_bet else "check")
    _act(engine, "check")
    _act(engine, "raise", 400)
    # the player who checked before the raise has to respond to it
    responders = {_act(engine, "call"), _act(engine, "call")}
    assert len(responders) == 2 and engine.phase == 'TURN'


def test_chips_of_a_player_who_leaves_mid_hand_are_paid_out():
    engine = _table(2000, 2000, 2000)
    engine.start_hand()
    for _ in range(3):
        _act(engine, "call" if engine.current_high_bet > _to_act(engine).current_bet else "check")
    assert engine.pot == 600
    leaver = next(p for p in engine.players if p.seat_index != engine.current_turn_seat_idx)
    _, _, returned = engine.remove_player(leaver.user_id)
    while engine.phase != 'SETTLEMENT':
        _act(engine, "check")
    # the leaver's 200 is part of what the winners collect
    assert sum(p.stack for p in engine.players) + returned == 6000


def test_player_seated_mid_hand_waits_for_the_next_hand():
    engine = _table(2000, 2000)
    engine.start_hand()
    engine.add_player("late", "Late", 2000)
    late = engine.get_player_by_id("late")
    assert not late.in_hand
    ok, _ = engine.process_action("late", "call")
    assert not ok
    # when one of the dealt players folds, the hand ends: the newcomer isn't in it
    _act(engine, "fold")
    assert engine.phase == 'SETTLEMENT'


def test_only_hands_that_reach_showdown_are_revealed():
    engine = _table(2000, 2000, 2000)
    engine.start_hand()
    folder = _act(engine, "fold")
    while engine.phase != 'SETTLEMENT':
        _act(engine, "call" if engine.current_high_bet > _to_act(engine).current_bet else "check")
    seen = {p["user_id"]: p["hole_cards"] for p in engine.get_public_state(for_user_id=None)["players"]}
    assert seen[folder] is None  # folded hands are mucked
    assert all(cards for uid, cards in seen.items() if uid != folder)

    # a hand won because everyone else folded is never shown
    engine = _table(2000, 2000)
    engine.start_hand()
    _act(engine, "fold")
    assert all(p["hole_cards"] is None for p in engine.get_public_state(for_user_id=None)["players"])


def test_short_all_in_does_not_lower_the_minimum_raise():
    # Dealer is seat 1 (the short stack), so it acts last after the flop
    engine = _table(5000, 700, 5000)
    engine.start_hand()
    while engine.phase == 'PRE_FLOP':
        _act(engine, "call" if engine.current_high_bet > _to_act(engine).current_bet else "check")
    assert _act(engine, "raise", 400) == "p2"  # a 400 bet: the minimum raise is now 400
    assert _act(engine, "call") == "p0"
    # the short stack moves in for 500: only 100 more, not a full raise
    assert _act(engine, "all_in") == "p1"
    assert engine.current_high_bet == 500
    assert engine.min_raise_amount == 400


def test_short_big_blind_still_costs_a_full_blind_to_call():
    # Dealer is seat 1, so seat 0 posts the big blind but only has 150
    engine = _table(150, 2000, 2000)
    engine.start_hand()
    bb = engine.get_player_by_id("p0")
    assert bb.total_bet_in_hand == 150 and bb.is_all_in
    assert engine.current_high_bet == 200
    assert _to_act(engine).current_bet == 0
    _act(engine, "call")
    assert engine.get_player_by_id("p1").current_bet == 200


def test_side_pot_only_pays_the_short_stack_what_it_covered():
    engine = _table(5000, 5000, 500)
    engine.start_hand()
    short = engine.get_player_by_id("p2")
    # make the short stack hold the nuts so it wins every pot it is eligible for
    short_cards = [Card.from_str(c) for c in ("AS", "AH")]
    others = [Card.from_str(c) for c in ("2C", "7D", "3C", "8D")]
    engine.get_player_by_id("p0").hole_cards = others[:2]
    engine.get_player_by_id("p1").hole_cards = others[2:]
    short.hole_cards = short_cards
    engine.deck.cards = [Card.from_str(c) for c in ("AD", "AC", "KS", "QH", "9C")] + engine.deck.cards
    while engine.phase != 'SETTLEMENT':
        player = _to_act(engine)
        _act(engine, "all_in" if player is short or engine.current_high_bet >= 500 else "call")
        if engine.phase not in ('SETTLEMENT',) and engine.current_high_bet > _to_act(engine).current_bet:
            continue
    won_by_short = short.stack
    # it can win at most 500 from each of the three players
    assert won_by_short == 1500
    assert sum(p.stack for p in engine.players) == 10500


def test_random_play_never_loses_chips_or_stalls():
    import random
    from app.services.poker.engine import BETTING_PHASES

    rng = random.Random(1234)
    for table in range(60):
        engine = PokerEngine(f"fuzz{table}", small_blind=100, big_blind=200)
        bank, carried = 0, 0
        for i in range(rng.randint(2, 6)):
            stack = rng.choice([150, 300, 2000, 5000])
            engine.add_player(f"f{i}", f"F{i}", stack)
            bank += stack
        for _ in range(8):
            for p in list(engine.players):
                if p.stack == 0:
                    engine.remove_player(p.user_id)
            if not engine.start_hand()[0]:
                break
            for _step in range(400):
                if engine.phase not in BETTING_PHASES:
                    break
                if rng.random() < 0.03 and len(engine.players) > 2:
                    carried += engine.remove_player(rng.choice(engine.players).user_id)[2]
                    continue
                player = _to_act(engine)
                assert player.in_hand and not player.is_folded and not player.is_all_in
                action = rng.choice(["fold", "check", "call", "raise", "all_in"])
                amount = engine.current_high_bet + engine.min_raise_amount * rng.choice([1, 2])
                if not engine.process_action(player.user_id, action, amount)[0]:
                    assert engine.process_action(player.user_id, "call")[0]
            assert engine.phase not in BETTING_PHASES, "hand never finished"
            in_pot = 0 if engine.phase == 'SETTLEMENT' else engine.pot
            assert sum(p.stack for p in engine.players) + in_pot + carried == bank
            engine.reset_to_waiting()


# ── Table server: turn clock, busted players, disconnects, cash-out ────────────

def _silence_table_io(monkeypatch, sent=None):
    async def record(table_id, user_id, payload):
        if sent is not None:
            sent.append((user_id, payload))

    async def no_broadcast(engine):
        return None

    async def no_bots(engine, db=None):
        return None

    monkeypatch.setattr(poker_ws.poker_ws_manager, "send_to_user", record)
    monkeypatch.setattr(poker_ws.poker_ws_manager, "broadcast_table_state", no_broadcast)
    monkeypatch.setattr(poker_ws, "run_bot_turns", no_bots)


def test_turn_clock_checks_or_folds_for_a_player_who_runs_out_of_time(monkeypatch):
    _silence_table_io(monkeypatch)
    monkeypatch.setattr(poker_ws, "_TURN_GRACE_SECONDS", 0)
    engine = _table(2000, 2000)
    engine.turn_duration = 0.05
    engine.start_hand()
    first = _to_act(engine)  # facing the big blind: can't check, so is folded

    async def scenario():
        clock = asyncio.create_task(poker_ws._run_turn_clock(engine))
        await asyncio.wait_for(clock, timeout=5)

    asyncio.run(scenario())
    assert first.is_folded
    assert engine.phase == 'SETTLEMENT'

    # From here on nobody ever owes anything, so every timeout is a check and
    # the hand plays itself out to a showdown without anyone being folded.
    engine = _table(2000, 2000)
    engine.turn_duration = 0.05
    engine.start_hand()
    _act(engine, "call")

    asyncio.run(asyncio.wait_for(poker_ws._run_turn_clock(engine), timeout=5))
    assert engine.phase == 'SETTLEMENT'
    assert engine.showdown_reached
    assert not any(p.is_folded for p in engine.players)


def _cash_table(db, *users, buy_in=2000):
    from app.models.poker import PokerTable, PokerPlayer
    table = PokerTable(name="Flow", is_practice=False, small_blind=100, big_blind=200,
                       min_buy_in=2000, max_buy_in=20000, max_players=6)
    db.add(table)
    db.commit()
    engine = poker_ws.poker_manager.get_or_create_table(table.id, False, 100, 200, 6)
    for i, u in enumerate(users):
        engine.add_player(str(u.id), u.username, buy_in)
        db.add(PokerPlayer(table_id=table.id, user_id=u.id, seat_index=i, stack=buy_in))
    db.commit()
    return table, engine


def test_busted_player_loses_the_seat_and_is_offered_a_rebuy(client, db, monkeypatch):
    from app.models.poker import PokerPlayer
    u1, _ = _poker_user(client, db, "bust1@example.com", "bust1")
    u2, _ = _poker_user(client, db, "bust2@example.com", "bust2")
    table, engine = _cash_table(db, u1, u2)
    sent = []
    _silence_table_io(monkeypatch, sent)
    monkeypatch.setattr(poker_ws.poker_ws_manager, "is_connected", lambda t, u: True)
    engine.get_player_by_id(str(u2.id)).stack = 0
    engine.phase = 'SETTLEMENT'

    asyncio.run(poker_ws.tidy_seats(engine, db))

    assert engine.get_player_by_id(str(u2.id)) is None
    assert db.query(PokerPlayer).filter(PokerPlayer.table_id == table.id, PokerPlayer.user_id == u2.id).count() == 0
    assert [(uid, msg["type"], msg["min_buy_in"]) for uid, msg in sent] == [(str(u2.id), "busted", 2000)]
    # The player with chips keeps their seat
    assert engine.get_player_by_id(str(u1.id)) is not None


def test_disconnected_players_sit_out_between_hands(monkeypatch):
    _silence_table_io(monkeypatch)
    engine = PokerEngine("practice-sit-out", is_practice=True)
    engine.add_player("here", "Here", 2000)
    engine.add_player("gone", "Gone", 2000)
    engine.add_player("third", "Third", 2000)
    monkeypatch.setattr(poker_ws.poker_ws_manager, "is_connected", lambda t, u: u != "gone")

    asyncio.run(poker_ws.tidy_seats(engine, None))
    engine.start_hand()

    gone = engine.get_player_by_id("gone")
    assert gone.is_sitting_out and not gone.in_hand and gone.total_bet_in_hand == 0


def test_opening_a_cash_table_never_charges_a_buy_in(client, db, monkeypatch):
    monkeypatch.setattr(poker_ws, "SessionLocal", sessionmaker(autocommit=False, autoflush=False, bind=db.get_bind()))
    user, token = _poker_user(client, db, "peek@example.com", "peek")
    table, engine = _cash_table(db)

    with client.websocket_connect(f"/api/v1/poker/ws/{table.id}?token={token}") as ws:
        state = ws.receive_json()["state"]
        assert state["players"] == []

    db.expire_all()
    assert get_balance(db, user.id).balance == 50000
    assert engine.get_player_by_id(str(user.id)) is None


def test_join_restores_a_seat_left_behind_by_a_restart(client, db):
    from app.models.poker import PokerPlayer
    user, token = _poker_user(client, db, "restore@example.com", "restore")
    table, engine = _cash_table(db, user, buy_in=3000)
    engine.remove_player(str(user.id))  # the in-memory seat is gone, the record is not

    resp = client.post(f"/api/v1/poker/tables/{table.id}/join", json={"buy_in_amount": 2000},
                       headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200 and resp.json()["message"] == "Seat restored"
    db.expire_all()
    assert get_balance(db, user.id).balance == 50000  # not charged again
    assert engine.get_player_by_id(str(user.id)).stack == 3000
    assert db.query(PokerPlayer).filter(PokerPlayer.table_id == table.id, PokerPlayer.user_id == user.id).count() == 1


def test_shutdown_pays_every_stack_back_and_voids_the_live_hand(client, db, monkeypatch):
    monkeypatch.setattr(poker_ws, "SessionLocal", sessionmaker(autocommit=False, autoflush=False, bind=db.get_bind()))
    u1, _ = _poker_user(client, db, "shut1@example.com", "shut1")
    u2, _ = _poker_user(client, db, "shut2@example.com", "shut2")
    for u in (u1, u2):
        get_balance(db, u.id).balance = 48000  # what's left after the 2000 buy-in
    db.commit()
    table, engine = _cash_table(db, u1, u2)
    engine.start_hand()  # blinds are in the pot when the server goes down

    asyncio.run(poker_ws.cash_out_all_tables())

    db.expire_all()
    assert get_balance(db, u1.id).balance == 50000
    assert get_balance(db, u2.id).balance == 50000
    assert engine.players == []


def test_player_who_stays_disconnected_is_cashed_out(client, db, monkeypatch):
    monkeypatch.setattr(poker_ws, "SessionLocal", sessionmaker(autocommit=False, autoflush=False, bind=db.get_bind()))
    _silence_table_io(monkeypatch)
    monkeypatch.setattr(poker_ws, "_DISCONNECT_CASHOUT_SECONDS", 0)
    u1, _ = _poker_user(client, db, "away1@example.com", "away1")
    u2, _ = _poker_user(client, db, "away2@example.com", "away2")
    get_balance(db, u1.id).balance = 48000
    db.commit()
    table, engine = _cash_table(db, u1, u2)
    engine.get_player_by_id(str(u1.id)).stack = 2600  # won 600 before dropping

    asyncio.run(poker_ws._cash_out_when_gone(table.id, str(u1.id)))

    db.expire_all()
    assert engine.get_player_by_id(str(u1.id)) is None
    assert get_balance(db, u1.id).balance == 48000 + 2600  # fee is 0% in the test config
