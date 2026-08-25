"""
Comprehensive Ludo E2E integration tests covering:
- Full game lifecycle (create, join, ready, start)
- Dice rolling and idempotency
- Token movement
- Capture mechanics
- Home path and exact roll
- Winner determination
- Invalid action rejection
- State recovery after refresh
"""
import uuid
import pytest
from unittest.mock import patch
from sqlalchemy.orm import Session

from app.services.ludo.engine import LudoEngine
from app.services.ludo.board import get_next_position, STARTS, SAFE_CELLS
from app.services.ludo.rules import get_legal_moves, check_capture, has_won
from app.models.ludo import LudoMatch, LudoMatchStatus, LudoColor, LudoPlayer, LudoToken


@pytest.fixture
def two_users(db):
    """Create two test users."""
    from app.models.user import User
    from app.security.password import hash_password
    from app.models.wallet import Wallet
    from app.models.game_catalog import Game, GameStatus
    import uuid
    suffix = str(uuid.uuid4())[:8]
    u1 = User(name=f"LudoA_{suffix}", username=f"ludoa_{suffix}", email=f"ludoa_{suffix}@test.com", password_hash=hash_password("pass123"))
    u2 = User(name=f"LudoB_{suffix}", username=f"ludob_{suffix}", email=f"ludob_{suffix}@test.com", password_hash=hash_password("pass123"))
    db.add_all([u1, u2])
    db.flush()
    
    w1 = Wallet(user_id=u1.id, balance=100000)
    w2 = Wallet(user_id=u2.id, balance=100000)
    db.add_all([w1, w2])
    
    game = db.query(Game).filter(Game.slug == "ludo").first()
    if not game:
        game = Game(name="Ludo", slug="ludo", game_type="MULTIPLAYER", status=GameStatus.ACTIVE, min_bet=0, max_bet=0, config={"entry_fee": 1000, "platform_fee_percent": 10})
        db.add(game)
    else:
        game.config = {"entry_fee": 1000, "platform_fee_percent": 10}
        
    db.commit()
    return u1, u2


class TestLudoGameLifecycle:
    """Tests for the full create -> join -> ready -> play lifecycle."""

    def test_create_join_ready_starts_game(self, db, two_users):
        u1, u2 = two_users
        engine = LudoEngine(db)

        match = engine.create_match(u1.id)
        assert match.status == LudoMatchStatus.WAITING
        assert len(match.players) == 1
        assert match.players[0].color == LudoColor.RED

        match = engine.join_match(match.id, u2.id)
        assert len(match.players) == 2
        assert match.players[1].color == LudoColor.GREEN

        # Only u1 ready — should stay WAITING
        match = engine.set_ready(match.id, u1.id)
        assert match.status == LudoMatchStatus.WAITING

        # Both ready — should start
        match = engine.set_ready(match.id, u2.id)
        assert match.status == LudoMatchStatus.IN_PROGRESS
        assert match.current_turn_color == LudoColor.RED

    def test_duplicate_join_rejected(self, db, two_users):
        u1, u2 = two_users
        engine = LudoEngine(db)
        match = engine.create_match(u1.id)
        with pytest.raises(ValueError, match="Already joined"):
            engine.join_match(match.id, u1.id)

    def test_join_full_match_rejected(self, db):
        from app.models.user import User
        from app.security.password import hash_password
        import uuid
        users = []
        suffix = str(uuid.uuid4())[:8]
        for i in range(5):
            u = User(name=f"P{i}_{suffix}", username=f"p{i}_{suffix}", email=f"p{i}_{suffix}@t.com", password_hash=hash_password("p"))
            db.add(u)
            users.append(u)
        db.commit()

        engine = LudoEngine(db)
        match = engine.create_match(users[0].id)
        for i in range(1, 4):
            engine.join_match(match.id, users[i].id)

        with pytest.raises(ValueError, match="Match full"):
            engine.join_match(match.id, users[4].id)

    def test_join_in_progress_rejected(self, db, two_users):
        u1, u2 = two_users
        engine = LudoEngine(db)
        match = engine.create_match(u1.id)
        engine.join_match(match.id, u2.id)
        engine.set_ready(match.id, u1.id)
        engine.set_ready(match.id, u2.id)

        from app.models.user import User
        from app.security.password import hash_password
        import uuid
        suffix = str(uuid.uuid4())[:8]
        u3 = User(name=f"P3_{suffix}", username=f"p3_{suffix}", email=f"p3_{suffix}@t.com", password_hash=hash_password("p"))
        db.add(u3)
        db.commit()
        with pytest.raises(ValueError, match="Match already in progress"):
            engine.join_match(match.id, u3.id)


class TestDiceRolling:
    """Tests for dice rolling mechanics."""

    def test_roll_dice_on_your_turn(self, db, two_users):
        u1, u2 = two_users
        engine = LudoEngine(db)
        match = engine.create_match(u1.id)
        engine.join_match(match.id, u2.id)
        engine.set_ready(match.id, u1.id)
        engine.set_ready(match.id, u2.id)

        result = engine.roll_dice(match.id, u1.id, str(uuid.uuid4()))
        assert "roll" in result
        assert 1 <= result["roll"] <= 6

    def test_roll_dice_not_your_turn(self, db, two_users):
        u1, u2 = two_users
        engine = LudoEngine(db)
        match = engine.create_match(u1.id)
        engine.join_match(match.id, u2.id)
        engine.set_ready(match.id, u1.id)
        engine.set_ready(match.id, u2.id)

        with pytest.raises(ValueError, match="Not your turn"):
            engine.roll_dice(match.id, u2.id, str(uuid.uuid4()))

    def test_duplicate_roll_rejected(self, db, two_users):
        u1, u2 = two_users
        engine = LudoEngine(db)
        match = engine.create_match(u1.id)
        engine.join_match(match.id, u2.id)
        engine.set_ready(match.id, u1.id)
        engine.set_ready(match.id, u2.id)

        key = str(uuid.uuid4())
        with patch("app.services.ludo.engine.roll_dice", return_value=6):
            engine.roll_dice(match.id, u1.id, key)
            with pytest.raises(ValueError, match="Duplicate action"):
                engine.roll_dice(match.id, u1.id, key)

    def test_double_roll_without_move_rejected(self, db, two_users):
        u1, u2 = two_users
        engine = LudoEngine(db)
        match = engine.create_match(u1.id)
        engine.join_match(match.id, u2.id)
        engine.set_ready(match.id, u1.id)
        engine.set_ready(match.id, u2.id)

        # Force a roll of 6 so turn doesn't auto-skip and last_dice_roll stays set
        with patch("app.services.ludo.engine.roll_dice", return_value=6):
            engine.roll_dice(match.id, u1.id, str(uuid.uuid4()))

        with pytest.raises(ValueError, match="Dice already rolled"):
            engine.roll_dice(match.id, u1.id, str(uuid.uuid4()))

    def test_no_legal_moves_skips_turn(self, db, two_users):
        u1, u2 = two_users
        engine = LudoEngine(db)
        match = engine.create_match(u1.id)
        engine.join_match(match.id, u2.id)
        engine.set_ready(match.id, u1.id)
        engine.set_ready(match.id, u2.id)
        assert match.current_turn_color == LudoColor.RED

        # All tokens at base, roll non-6 => no legal moves => auto skip
        with patch("app.services.ludo.engine.roll_dice", return_value=3):
            result = engine.roll_dice(match.id, u1.id, str(uuid.uuid4()))
        assert result["legal_moves"] == []

        db.refresh(match)
        assert match.current_turn_color == LudoColor.GREEN


class TestTokenMovement:
    """Tests for token movement mechanics."""

    def test_move_out_of_base_with_six(self, db, two_users):
        u1, u2 = two_users
        engine = LudoEngine(db)
        match = engine.create_match(u1.id)
        engine.join_match(match.id, u2.id)
        engine.set_ready(match.id, u1.id)
        engine.set_ready(match.id, u2.id)

        with patch("app.services.ludo.engine.roll_dice", return_value=6):
            result = engine.roll_dice(match.id, u1.id, str(uuid.uuid4()))
        assert 0 in result["legal_moves"]  # all base tokens can move

        move_result = engine.move_token(match.id, u1.id, 0, str(uuid.uuid4()))
        assert move_result["moved"] is True

        db.refresh(match)
        red_player = next(p for p in match.players if p.color == LudoColor.RED)
        token0 = next(t for t in red_player.tokens if t.token_index == 0)
        assert token0.position == STARTS[LudoColor.RED]  # position 0

    def test_move_without_roll_rejected(self, db, two_users):
        u1, u2 = two_users
        engine = LudoEngine(db)
        match = engine.create_match(u1.id)
        engine.join_match(match.id, u2.id)
        engine.set_ready(match.id, u1.id)
        engine.set_ready(match.id, u2.id)

        with pytest.raises(ValueError, match="Roll dice first"):
            engine.move_token(match.id, u1.id, 0, str(uuid.uuid4()))

    def test_illegal_move_rejected(self, db, two_users):
        u1, u2 = two_users
        engine = LudoEngine(db)
        match = engine.create_match(u1.id)
        engine.join_match(match.id, u2.id)
        engine.set_ready(match.id, u1.id)
        engine.set_ready(match.id, u2.id)

        # Roll a 3 with all tokens at base => no legal moves, turn skips
        # Let's do it differently: roll a 6, get a token out, then next turn
        with patch("app.services.ludo.engine.roll_dice", return_value=6):
            engine.roll_dice(match.id, u1.id, str(uuid.uuid4()))
        engine.move_token(match.id, u1.id, 0, str(uuid.uuid4()))  # token 0 now at pos 0

        # u1 gets extra turn for rolling 6, roll a 3
        db.refresh(match)
        assert match.current_turn_color == LudoColor.RED  # kept turn

        with patch("app.services.ludo.engine.roll_dice", return_value=3):
            result = engine.roll_dice(match.id, u1.id, str(uuid.uuid4()))

        # token 1,2,3 at base can't move with 3, only token 0 can
        assert 0 in result["legal_moves"]
        # Try to move token 1 (at base, can't move with 3)
        with pytest.raises(ValueError, match="Illegal move"):
            engine.move_token(match.id, u1.id, 1, str(uuid.uuid4()))

    def test_extra_turn_on_six(self, db, two_users):
        u1, u2 = two_users
        engine = LudoEngine(db)
        match = engine.create_match(u1.id)
        engine.join_match(match.id, u2.id)
        engine.set_ready(match.id, u1.id)
        engine.set_ready(match.id, u2.id)

        with patch("app.services.ludo.engine.roll_dice", return_value=6):
            engine.roll_dice(match.id, u1.id, str(uuid.uuid4()))
        engine.move_token(match.id, u1.id, 0, str(uuid.uuid4()))

        db.refresh(match)
        # Should still be RED's turn after rolling 6
        assert match.current_turn_color == LudoColor.RED

    def test_duplicate_move_rejected(self, db, two_users):
        u1, u2 = two_users
        engine = LudoEngine(db)
        match = engine.create_match(u1.id)
        engine.join_match(match.id, u2.id)
        engine.set_ready(match.id, u1.id)
        engine.set_ready(match.id, u2.id)

        with patch("app.services.ludo.engine.roll_dice", return_value=6):
            engine.roll_dice(match.id, u1.id, str(uuid.uuid4()))

        key = str(uuid.uuid4())
        engine.move_token(match.id, u1.id, 0, key)
        with pytest.raises(ValueError, match="Duplicate action"):
            engine.move_token(match.id, u1.id, 0, key)


class TestCaptureLogic:
    """Tests for capture mechanics."""

    def test_capture_sends_opponent_to_base(self, db, two_users):
        u1, u2 = two_users
        engine = LudoEngine(db)
        match = engine.create_match(u1.id)
        engine.join_match(match.id, u2.id)
        engine.set_ready(match.id, u1.id)
        engine.set_ready(match.id, u2.id)

        red_player = next(p for p in match.players if p.color == LudoColor.RED)
        green_player = next(p for p in match.players if p.color == LudoColor.GREEN)

        # Manually place tokens for capture test
        red_t0 = next(t for t in red_player.tokens if t.token_index == 0)
        green_t0 = next(t for t in green_player.tokens if t.token_index == 0)

        # Place green token on a non-safe cell
        # Position 5 is not in SAFE_CELLS [0, 8, 13, 21, 26, 34, 39, 47]
        green_t0.position = 5
        # Place red token at position 2 (will move 3 to reach 5)
        red_t0.position = 2

        db.commit()
        db.refresh(match)

        with patch("app.services.ludo.engine.roll_dice", return_value=3):
            engine.roll_dice(match.id, u1.id, str(uuid.uuid4()))
        engine.move_token(match.id, u1.id, 0, str(uuid.uuid4()))

        db.refresh(green_t0)
        db.refresh(red_t0)
        assert red_t0.position == 5
        assert green_t0.position == -1  # captured, sent to base

    def test_no_capture_on_safe_cell(self, db, two_users):
        u1, u2 = two_users
        engine = LudoEngine(db)
        match = engine.create_match(u1.id)
        engine.join_match(match.id, u2.id)
        engine.set_ready(match.id, u1.id)
        engine.set_ready(match.id, u2.id)

        red_player = next(p for p in match.players if p.color == LudoColor.RED)
        green_player = next(p for p in match.players if p.color == LudoColor.GREEN)

        red_t0 = next(t for t in red_player.tokens if t.token_index == 0)
        green_t0 = next(t for t in green_player.tokens if t.token_index == 0)

        # Place green on safe cell 8
        green_t0.position = 8
        # Place red at position 5 (move 3 to reach 8)
        red_t0.position = 5

        db.commit()
        db.refresh(match)

        with patch("app.services.ludo.engine.roll_dice", return_value=3):
            engine.roll_dice(match.id, u1.id, str(uuid.uuid4()))
        engine.move_token(match.id, u1.id, 0, str(uuid.uuid4()))

        db.refresh(green_t0)
        db.refresh(red_t0)
        assert red_t0.position == 8
        assert green_t0.position == 8  # NOT captured — safe cell


class TestBoardLogic:
    """Tests for board position calculations."""

    def test_base_requires_six_to_exit(self):
        for roll in range(1, 6):
            assert get_next_position(-1, roll, LudoColor.RED) is None
        assert get_next_position(-1, 6, LudoColor.RED) == 0

    def test_already_home_cannot_move(self):
        assert get_next_position(57, 1, LudoColor.RED) is None

    def test_normal_board_movement(self):
        assert get_next_position(5, 3, LudoColor.RED) == 8

    def test_board_wraps_around(self):
        assert get_next_position(50, 4, LudoColor.RED) == 2  # (50+4)%52 = 2

    def test_home_path_entry_red(self):
        # RED starts at 0, turn_pos = (0-2)%52 = 50
        # From position 49, roll 3 should enter home path
        # dist_to_turn = (50-49)%52 = 1
        # remaining = 3 - 1 - 1 = 1
        # returns 52 + 1 = 53
        result = get_next_position(49, 3, LudoColor.RED)
        assert result == 53

    def test_exact_home_entry(self):
        # From position 52 (first home path cell), rolling exactly 5 should reach 57 (home)
        result = get_next_position(52, 5, LudoColor.RED)
        assert result == 57

    def test_home_overshoot_rejected(self):
        # From position 55 (fourth home path cell), rolling 3 => 55+3=58 > 57
        result = get_next_position(55, 3, LudoColor.RED)
        assert result is None

    def test_green_start_position(self):
        assert get_next_position(-1, 6, LudoColor.GREEN) == 13

    def test_yellow_start_position(self):
        assert get_next_position(-1, 6, LudoColor.YELLOW) == 26

    def test_blue_start_position(self):
        assert get_next_position(-1, 6, LudoColor.BLUE) == 39


class TestWinnerDetermination:
    """Tests for win condition and match completion."""

    def test_all_tokens_home_wins(self, db, two_users):
        u1, u2 = two_users
        engine = LudoEngine(db)
        match = engine.create_match(u1.id)
        engine.join_match(match.id, u2.id)
        engine.set_ready(match.id, u1.id)
        engine.set_ready(match.id, u2.id)

        red_player = next(p for p in match.players if p.color == LudoColor.RED)

        # Put 3 tokens already at home
        for t in red_player.tokens:
            if t.token_index < 3:
                t.position = 57
                t.is_home = True

        # Put last token at position 56 (one away from home)
        last_token = next(t for t in red_player.tokens if t.token_index == 3)
        last_token.position = 56

        db.commit()
        db.refresh(match)

        with patch("app.services.ludo.engine.roll_dice", return_value=1):
            engine.roll_dice(match.id, u1.id, str(uuid.uuid4()))
        engine.move_token(match.id, u1.id, 3, str(uuid.uuid4()))

        db.refresh(red_player)
        assert red_player.rank == 1
        db.refresh(last_token)
        assert last_token.is_home is True

    def test_completed_match_rejects_actions(self, db, two_users):
        u1, u2 = two_users
        engine = LudoEngine(db)
        match = engine.create_match(u1.id)
        engine.join_match(match.id, u2.id)
        engine.set_ready(match.id, u1.id)
        engine.set_ready(match.id, u2.id)

        # Force match to COMPLETED
        match.status = LudoMatchStatus.COMPLETED
        db.commit()

        with pytest.raises(ValueError, match="Match not in progress"):
            engine.roll_dice(match.id, u1.id, str(uuid.uuid4()))

    def test_two_player_game_completes_when_both_finish(self, db, two_users):
        u1, u2 = two_users
        engine = LudoEngine(db)
        match = engine.create_match(u1.id)
        engine.join_match(match.id, u2.id)
        engine.set_ready(match.id, u1.id)
        engine.set_ready(match.id, u2.id)

        red_player = next(p for p in match.players if p.color == LudoColor.RED)
        green_player = next(p for p in match.players if p.color == LudoColor.GREEN)

        # Both players finish
        for p in [red_player, green_player]:
            for t in p.tokens:
                t.position = 57
                t.is_home = True
            p.rank = 1 if p == red_player else 2

        # Now try next_turn — it should mark match as COMPLETED
        from app.services.ludo.state import next_turn
        next_turn(match)
        assert match.status == LudoMatchStatus.COMPLETED


class TestStateRecovery:
    """Tests for state recovery after refresh."""

    def test_get_state_returns_full_match(self, db, two_users):
        u1, u2 = two_users
        engine = LudoEngine(db)
        match = engine.create_match(u1.id)
        engine.join_match(match.id, u2.id)
        engine.set_ready(match.id, u1.id)
        engine.set_ready(match.id, u2.id)

        from app.services.ludo.state import get_match
        recovered = get_match(db, match.id)
        assert recovered is not None
        assert recovered.status == LudoMatchStatus.IN_PROGRESS
        assert len(recovered.players) == 2
        for p in recovered.players:
            assert len(p.tokens) == 4
