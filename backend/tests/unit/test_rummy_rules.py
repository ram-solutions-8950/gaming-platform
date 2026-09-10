import pytest
from app.services.rummy.deals_rummy import DealsRummyGame, GameConfig, Phase, PlayerStatus


def test_rummy_player_leave_in_waiting():
    game = DealsRummyGame("t_wait", GameConfig(max_players=2))
    game.add_player("u1", "Player 1")
    game.add_player("u2", "Player 2")
    assert len(game.players) == 2

    game.player_leave("u2")
    assert len(game.players) == 1
    assert game.players[0].id == "u1"
    assert game.phase == Phase.WAITING


def test_rummy_player_leave_during_deal_declares_winner():
    game = DealsRummyGame("t_active", GameConfig(num_deals=2))
    game.add_player("p1", "Player 1")
    game.add_player("p2", "Player 2")
    game.start_deal()

    assert game.phase in (Phase.AWAIT_DRAW, Phase.AWAIT_DISCARD)
    # p2 exits/forfeits
    game.player_leave("p2")

    # Remaining player p1 must be declared the winner immediately
    assert game.phase == Phase.GAME_OVER
    assert game.winner_id == "p1"
    p2 = next(p for p in game.players if p.id == "p2")
    assert p2.status == PlayerStatus.LOST
    assert p2.deal_points == 80  # Full forfeit penalty
    p1 = next(p for p in game.players if p.id == "p1")
    assert p1.status == PlayerStatus.WON
    assert p1.chips > 160


def test_rummy_player_leave_in_multiplayer():
    game = DealsRummyGame("t_multi", GameConfig(max_players=4, min_players=2))
    game.add_player("p1", "Player 1")
    game.add_player("p2", "Player 2")
    game.add_player("p3", "Player 3")
    game.start_deal()

    # One player leaves, 2 active players remain
    game.player_leave("p2")
    assert game.phase in (Phase.AWAIT_DRAW, Phase.AWAIT_DISCARD)
    active = [p for p in game.players if p.status == PlayerStatus.ACTIVE]
    assert len(active) == 2
    assert "p1" in [p.id for p in active]
    assert "p3" in [p.id for p in active]
