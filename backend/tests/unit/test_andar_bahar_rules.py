import pytest
from app.services.game_engines.andar_bahar import (
    Card,
    fresh_deck,
    start_side,
    deal_round,
    merge_andar_bahar_config,
    DEFAULT_CONFIG,
)
from app.models.game_catalog import Game, GameStatus


def test_andar_bahar_deck_has_52_unique_cards():
    deck = fresh_deck()
    assert len(deck) == 52
    labels = [c.label for c in deck]
    assert len(set(labels)) == 52


def test_card_properties():
    card_spades = Card(rank=1, suit="S")
    assert card_spades.label == "A♠"
    assert not card_spades.is_red

    card_hearts = Card(rank=13, suit="H")
    assert card_hearts.label == "K♥"
    assert card_hearts.is_red

    card_diamonds = Card(rank=10, suit="D")
    assert card_diamonds.label == "10♦"
    assert card_diamonds.is_red

    card_clubs = Card(rank=11, suit="C")
    assert card_clubs.label == "J♣"
    assert not card_clubs.is_red


def test_start_side_rules():
    # Black card deals to ANDAR first
    black_card = Card(rank=7, suit="S")
    assert start_side(black_card) == "andar"

    # Red card deals to BAHAR first
    red_card = Card(rank=7, suit="H")
    assert start_side(red_card) == "bahar"


def test_deal_round_structure():
    result = deal_round()
    assert "middle" in result
    assert "winner" in result
    assert result["winner"] in ("ANDAR", "BAHAR")
    assert len(result["steps"]) > 0

    # Winner's last dealt card must match the middle card rank
    target_rank = result["middle"]["rank"]
    last_step = result["steps"][-1]
    assert last_step["side"].upper() == result["winner"]
    assert last_step["card"]["rank"] == target_rank


def test_default_config_minimum_bet_is_5000_paise():
    assert DEFAULT_CONFIG["min_bet"] == 5000


def test_merge_andar_bahar_config_enforces_min_bet_5000():
    game = Game(
        name="Andar Bahar",
        slug="andar-bahar",
        game_type="ANDAR_BAHAR",
        min_bet=1000,
        max_bet=500000,
        config={"min_bet": 1000},
    )
    cfg = merge_andar_bahar_config(game)
    # Even if DB or config had 1000, min_bet is clamped to at least 5000 (₹50)
    assert cfg["min_bet"] >= 5000
