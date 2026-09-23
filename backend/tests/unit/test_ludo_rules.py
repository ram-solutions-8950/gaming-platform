import pytest
import uuid
from app.models.ludo import LudoColor, LudoToken
from app.services.ludo.board import (
    HOME_STEP,
    TRACK_LENGTH,
    get_absolute_position,
    is_cell_safe,
    SAFE_CELLS,
)
from app.services.ludo.rules import (
    get_target_step,
    can_move_token,
    get_legal_token_indices,
    check_capture,
    check_player_won,
    find_blockades,
)

def test_opposite_colors_board_geometry():
    # Red start is 0
    assert get_absolute_position(0, LudoColor.RED) == 0
    # Yellow start is 26 (opposite, 180 degrees from 0 on 52-cell track)
    assert get_absolute_position(0, LudoColor.YELLOW) == 26
    # Distance between RED and YELLOW is exactly half the board (26 cells)
    assert (get_absolute_position(0, LudoColor.YELLOW) - get_absolute_position(0, LudoColor.RED)) == 26

def test_safe_cells_identification():
    # 4 start cells are safe
    assert is_cell_safe(0)
    assert is_cell_safe(13)
    assert is_cell_safe(26)
    assert is_cell_safe(39)
    # 4 star cells are safe
    assert is_cell_safe(8)
    assert is_cell_safe(21)
    assert is_cell_safe(34)
    assert is_cell_safe(47)
    # Non-safe cells
    assert not is_cell_safe(1)
    assert not is_cell_safe(2)
    assert not is_cell_safe(12)
    assert not is_cell_safe(25)

def test_token_exit_yard_requires_six():
    # Only 6 can exit yard (position -1 -> 0)
    for roll in [1, 2, 3, 4, 5]:
        assert get_target_step(-1, roll) is None
    assert get_target_step(-1, 6) == 0

def test_token_exact_roll_to_home():
    # Step 54 + 2 = 56 (Home)
    assert get_target_step(54, 2) == 56
    # Step 54 + 3 = 57 > 56 -> Illegal (overshoot)
    assert get_target_step(54, 3) is None

def test_blockade_prevents_opponent_passing_or_landing():
    p1_id = uuid.uuid4()
    p2_id = uuid.uuid4()

    # Player 1 (Red) has 2 tokens on step 5 (abs pos 5)
    t1 = LudoToken(id=uuid.uuid4(), player_id=p1_id, token_index=0, position=5, is_home=False)
    t2 = LudoToken(id=uuid.uuid4(), player_id=p1_id, token_index=1, position=5, is_home=False)

    # Player 2 (Yellow) has token on step 10 (abs pos (26+10)%52 = 36). Let's place Yellow token at abs pos 3
    # Step for Yellow to reach abs pos 3: (26 + step) % 52 = 3 => step = 29
    t_yellow = LudoToken(id=uuid.uuid4(), player_id=p2_id, token_index=0, position=27, is_home=False) # abs pos 1

    all_tokens = [t1, t2, t_yellow]
    color_map = {str(p1_id): LudoColor.RED, str(p2_id): LudoColor.YELLOW}

    # Blockade detected at abs pos 5
    blockades = find_blockades(all_tokens, color_map)
    assert 5 in blockades
    assert blockades[5] == LudoColor.RED

    # Yellow token at abs pos 1 rolling 4 wants to land on abs pos 5 (Red blockade) -> Illegal!
    assert not can_move_token(t_yellow, 4, LudoColor.YELLOW, all_tokens, color_map)

    # Yellow token at abs pos 1 rolling 5 wants to jump past abs pos 5 to abs pos 6 -> Blocked!
    assert not can_move_token(t_yellow, 5, LudoColor.YELLOW, all_tokens, color_map)

def test_capture_on_non_safe_cell():
    p1_id = uuid.uuid4()
    p2_id = uuid.uuid4()

    # Yellow token at step 5: abs pos (26 + 5) % 52 = 31 (not safe)
    t_yellow = LudoToken(id=uuid.uuid4(), player_id=p2_id, token_index=0, position=5, is_home=False)
    color_map = {str(p1_id): LudoColor.RED, str(p2_id): LudoColor.YELLOW}

    # Red lands on abs pos 31
    captured = check_capture(31, LudoColor.RED, [t_yellow], color_map)
    assert captured is not None
    assert captured.player_id == p2_id

def test_no_capture_on_safe_cell():
    p1_id = uuid.uuid4()
    p2_id = uuid.uuid4()

    # Yellow token on safe cell 8 (Star cell)
    t_yellow = LudoToken(id=uuid.uuid4(), player_id=p2_id, token_index=0, position=34, is_home=False) # (26 + 34) % 52 = 8
    color_map = {str(p1_id): LudoColor.RED, str(p2_id): LudoColor.YELLOW}

    captured = check_capture(8, LudoColor.RED, [t_yellow], color_map)
    assert captured is None  # Cannot capture on star cell!

def test_win_condition_four_tokens_home():
    tokens = [
        LudoToken(id=uuid.uuid4(), token_index=i, position=56, is_home=True)
        for i in range(4)
    ]
    assert check_player_won(tokens)

    # If only 3 tokens home
    tokens[3].position = 55
    tokens[3].is_home = False
    assert not check_player_won(tokens)


def test_ludo_roll_guaranteed_six_for_stranded_player():
    from app.services.ludo.engine import _compute_ludo_roll, _TURNS_WITHOUT_SIX
    from app.models.ludo import LudoMatch, LudoPlayer, LudoToken, LudoMatchStatus

    match_id = uuid.uuid4()
    p1_id = uuid.uuid4()
    p2_id = uuid.uuid4()

    p1 = LudoPlayer(id=p1_id, match_id=match_id, color=LudoColor.RED, seat_index=0)
    p1.tokens = [LudoToken(id=uuid.uuid4(), player_id=p1_id, token_index=i, position=-1) for i in range(4)]
    p2 = LudoPlayer(id=p2_id, match_id=match_id, color=LudoColor.YELLOW, seat_index=1)
    p2.tokens = [LudoToken(id=uuid.uuid4(), player_id=p2_id, token_index=i, position=-1) for i in range(4)]

    match = LudoMatch(id=match_id, status=LudoMatchStatus.IN_PROGRESS, players=[p1, p2])

    # After 2 turns without a 6 when all 4 tokens in yard, roll is 100% guaranteed to be 6
    _TURNS_WITHOUT_SIX[str(match_id)] = {str(p1_id): 2}
    roll = _compute_ludo_roll(match, p1, current_sixes=0)
    assert roll == 6
    # And counter resets to 0
    assert _TURNS_WITHOUT_SIX[str(match_id)][str(p1_id)] == 0


def test_ludo_roll_guaranteed_six_when_opponent_has_active_tokens():
    from app.services.ludo.engine import _compute_ludo_roll, _TURNS_WITHOUT_SIX
    from app.models.ludo import LudoMatch, LudoPlayer, LudoToken, LudoMatchStatus

    match_id = uuid.uuid4()
    p1_id = uuid.uuid4()
    p2_id = uuid.uuid4()

    # P1 (Red) has 1 active token on the track
    p1 = LudoPlayer(id=p1_id, match_id=match_id, color=LudoColor.RED, seat_index=0)
    p1.tokens = [
        LudoToken(id=uuid.uuid4(), player_id=p1_id, token_index=0, position=10, is_home=False),
        LudoToken(id=uuid.uuid4(), player_id=p1_id, token_index=1, position=-1),
        LudoToken(id=uuid.uuid4(), player_id=p1_id, token_index=2, position=-1),
        LudoToken(id=uuid.uuid4(), player_id=p1_id, token_index=3, position=-1),
    ]

    # P2 (Yellow) has ALL 4 tokens in yard (completely stranded)
    p2 = LudoPlayer(id=p2_id, match_id=match_id, color=LudoColor.YELLOW, seat_index=1)
    p2.tokens = [LudoToken(id=uuid.uuid4(), player_id=p2_id, token_index=i, position=-1) for i in range(4)]

    match = LudoMatch(id=match_id, status=LudoMatchStatus.IN_PROGRESS, players=[p1, p2])

    # If P2 has had at least 1 turn without 6 while opponent is running on board, next roll is 100% 6
    _TURNS_WITHOUT_SIX[str(match_id)] = {str(p2_id): 1}
    roll = _compute_ludo_roll(match, p2, current_sixes=0)
    assert roll == 6
    assert _TURNS_WITHOUT_SIX[str(match_id)][str(p2_id)] == 0


def test_ludo_roll_subsequent_tokens_guaranteed_six():
    from app.services.ludo.engine import _compute_ludo_roll, _TURNS_WITHOUT_SIX
    from app.models.ludo import LudoMatch, LudoPlayer, LudoToken, LudoMatchStatus

    match_id = uuid.uuid4()
    p1_id = uuid.uuid4()

    p1 = LudoPlayer(id=p1_id, match_id=match_id, color=LudoColor.RED, seat_index=0)
    # 1 token out, 3 in yard
    p1.tokens = [
        LudoToken(id=uuid.uuid4(), player_id=p1_id, token_index=0, position=5, is_home=False),
        LudoToken(id=uuid.uuid4(), player_id=p1_id, token_index=1, position=-1),
        LudoToken(id=uuid.uuid4(), player_id=p1_id, token_index=2, position=-1),
        LudoToken(id=uuid.uuid4(), player_id=p1_id, token_index=3, position=-1),
    ]

    match = LudoMatch(id=match_id, status=LudoMatchStatus.IN_PROGRESS, players=[p1])

    # If player hasn't rolled a 6 in 4 turns, guaranteed 6 to bring out next token
    _TURNS_WITHOUT_SIX[str(match_id)] = {str(p1_id): 4}
    roll = _compute_ludo_roll(match, p1, current_sixes=0)
    assert roll == 6

