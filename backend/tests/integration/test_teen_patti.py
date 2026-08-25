"""
Integration and Unit Tests for Teen Patti Backend Engine.
"""
import random
import pytest
from app.services.teen_patti import bot_strategy
from app.services.teen_patti.cards import Card, derive_seed, fresh_deck, shuffled_deck
from app.services.teen_patti.engine import GameConfig, Phase, PlayerStatus, TeenPattiHand
from app.services.teen_patti.hand_rank import HandCategory, evaluate_hand, category_of


def _cards(*specs):
    """'7H' -> Card(7, 'H'); 'AH' -> Card(14, 'H')."""
    out = []
    for spec in specs:
        rank_part, suit = spec[:-1], spec[-1]
        rank = {"A": 14, "K": 13, "Q": 12, "J": 11}.get(rank_part, None)
        if rank is None:
            rank = int(rank_part)
        out.append(Card(rank, suit))
    return out


def test_hand_rank_trail_beats_everything():
    trail_2 = evaluate_hand(_cards("2H", "2D", "2S"))
    pure_akq = evaluate_hand(_cards("AH", "KH", "QH"))
    assert trail_2.category == HandCategory.TRAIL
    assert pure_akq.category == HandCategory.PURE_SEQUENCE
    assert trail_2 > pure_akq


def test_hand_rank_pure_sequence_a23_ranks_below_akq():
    akq = evaluate_hand(_cards("AS", "KS", "QS"))
    a23 = evaluate_hand(_cards("AD", "2D", "3D"))
    kqj = evaluate_hand(_cards("KC", "QC", "JC"))
    assert akq > kqj > a23


def test_hand_rank_sequence_beats_color():
    seq = evaluate_hand(_cards("4S", "5H", "6D"))
    flush = evaluate_hand(_cards("AH", "JH", "2H"))
    assert seq.category == HandCategory.SEQUENCE
    assert flush.category == HandCategory.COLOR
    assert seq > flush


def test_hand_rank_color_beats_pair():
    flush = evaluate_hand(_cards("2H", "4H", "8H"))
    pair_a = evaluate_hand(_cards("AS", "AD", "KC"))
    assert flush > pair_a


def test_hand_rank_pair_beats_high_card():
    pair = evaluate_hand(_cards("2S", "2D", "3C"))
    high_a = evaluate_hand(_cards("AS", "KD", "JC"))
    assert high_a.category == HandCategory.HIGH_CARD
    assert pair.category == HandCategory.PAIR
    assert pair > high_a


def test_game_engine_pot_and_turn_progression():
    cfg = GameConfig(boot_amount=100, max_players=3)
    hand = TeenPattiHand(cfg)
    hand.add_seat("p1", "Player 1")
    hand.add_seat("p2", "Player 2")
    hand.add_seat("p3", "Player 3")

    hand.start_hand(client_seed="test_seed", nonce=1)
    assert hand.pot == 300
    assert hand.current_stake == 100
    assert hand.phase == Phase.PLAYING

    # Player 1 (turn 1) bets blind (100)
    curr = hand.seats[hand.current_turn].id
    hand.bet(curr, raise_=False)
    assert hand.pot == 400

    # Next player sees cards, then bets seen (2x current stake = 200)
    curr2 = hand.seats[hand.current_turn].id
    hand.see(curr2)
    hand.bet(curr2, raise_=False)
    assert hand.pot == 600


def test_game_engine_pack_ends_when_one_player_left():
    cfg = GameConfig(boot_amount=100, max_players=2)
    hand = TeenPattiHand(cfg)
    hand.add_seat("p1", "Player 1")
    hand.add_seat("p2", "Player 2")

    hand.start_hand(client_seed="pack_seed", nonce=1)
    curr = hand.seats[hand.current_turn].id
    other_idx = 1 if hand.current_turn == 0 else 0
    other_id = hand.seats[other_idx].id

    hand.pack(curr)
    assert hand.phase == Phase.FINISHED
    assert hand.winner_seat == other_idx
    assert hand.pot == 200


def test_game_engine_showdown_resolves_winner():
    cfg = GameConfig(boot_amount=100, max_players=2)
    hand = TeenPattiHand(cfg)
    hand.add_seat("p1", "Player 1")
    hand.add_seat("p2", "Player 2")

    hand.start_hand(client_seed="show_seed", nonce=1)
    # Force hands
    hand.seats[0].cards = _cards("AH", "AD", "AS")  # Trail of Aces
    hand.seats[1].cards = _cards("KH", "KD", "KS")  # Trail of Kings
    hand.seats[0].seen = True
    hand.seats[1].seen = True

    curr = hand.seats[hand.current_turn].id
    hand.show(curr)
    assert hand.phase == Phase.SHOWDOWN or hand.phase == Phase.FINISHED
    assert hand.winner_seat == 0


def test_game_engine_side_show():
    cfg = GameConfig(boot_amount=100, max_players=3)
    hand = TeenPattiHand(cfg)
    hand.add_seat("p1", "Player 1")
    hand.add_seat("p2", "Player 2")
    hand.add_seat("p3", "Player 3")

    hand.start_hand(client_seed="side_seed", nonce=1)
    hand.seats[0].cards = _cards("AH", "AD", "AS") # Trail
    hand.seats[1].cards = _cards("2H", "3D", "4S") # Seq
    hand.seats[2].cards = _cards("5H", "7D", "9S") # High Card
    hand.seats[0].seen = True
    hand.seats[1].seen = True
    hand.seats[2].seen = True

    # P2 side-shows with P1 (target)
    hand.current_turn = 1
    res = hand.side_show("p2", accept=True)
    assert res["accepted"] is True
    assert res["loser_seat"] == 1  # P2 loses to P1
    assert hand.seats[1].status == PlayerStatus.LOST_SIDE_SHOW
