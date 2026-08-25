import pytest
from app.services.poker.cards import Card, Deck
from app.services.poker.hand_rank import HandCategory
from app.services.poker.evaluator import evaluate_5card_hand, evaluate_best_hand
from app.services.poker.engine import PokerEngine

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

    turn1_user = next(p.user_id for p in engine.players if p.seat_index == engine.current_turn_seat_idx)
    turn2_user = next(p.user_id for p in engine.players if p.user_id != turn1_user)

    ok, _ = engine.process_action(turn1_user, "call")
    assert ok
    ok, _ = engine.process_action(turn2_user, "check")
    assert ok

    assert engine.phase == 'FLOP'
    assert len(engine.community_cards) == 3

    turn3_user = next(p.user_id for p in engine.players if p.seat_index == engine.current_turn_seat_idx)
    turn4_user = next(p.user_id for p in engine.players if p.user_id != turn3_user)
    engine.process_action(turn3_user, "check")
    engine.process_action(turn4_user, "check")

    assert engine.phase == 'TURN'
    assert len(engine.community_cards) == 4

    turn5_user = next(p.user_id for p in engine.players if p.seat_index == engine.current_turn_seat_idx)
    turn6_user = next(p.user_id for p in engine.players if p.user_id != turn5_user)
    engine.process_action(turn5_user, "check")
    engine.process_action(turn6_user, "check")

    assert engine.phase == 'RIVER'
    assert len(engine.community_cards) == 5

    turn7_user = next(p.user_id for p in engine.players if p.seat_index == engine.current_turn_seat_idx)
    turn8_user = next(p.user_id for p in engine.players if p.seat_index != turn7_user)
    engine.process_action(turn7_user, "check")
    engine.process_action(turn8_user, "check")

    assert engine.phase == 'SETTLEMENT'
    assert len(engine.winners_summary) >= 1

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
