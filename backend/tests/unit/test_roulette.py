import pytest
from app.services.roulette.engine import check_bet_win, RED_NUMBERS, BLACK_NUMBERS, roulette_engine

def test_roulette_straight_win():
    # Test straight 17 wins when 17 hits
    is_win, mult = check_bet_win("straight", "17", 17)
    assert is_win is True
    assert mult == 35

    # Test straight 17 loses when 18 hits
    is_win, mult = check_bet_win("straight", "17", 18)
    assert is_win is False
    assert mult == 0

def test_roulette_zero():
    # Straight 0 wins on 0
    is_win, mult = check_bet_win("straight", "0", 0)
    assert is_win is True
    assert mult == 35

    # Red, Black, Even, Odd, Low, High, Dozen, Col lose on 0
    for t in ["red", "black", "even", "odd", "1-18", "19-36", "1st12", "col1"]:
        is_win, _ = check_bet_win("even_money", t, 0)
        assert is_win is False

def test_roulette_red_black():
    is_win, mult = check_bet_win("even_money", "red", 7)
    assert is_win is True
    assert mult == 1

    is_win, _ = check_bet_win("even_money", "black", 7)
    assert is_win is False

    is_win, mult = check_bet_win("even_money", "black", 8)
    assert is_win is True
    assert mult == 1

def test_roulette_even_odd():
    is_win, mult = check_bet_win("even_money", "even", 14)
    assert is_win is True
    assert mult == 1

    is_win, _ = check_bet_win("even_money", "odd", 14)
    assert is_win is False

def test_roulette_low_high():
    is_win, mult = check_bet_win("even_money", "1 to 18", 5)
    assert is_win is True
    assert mult == 1

    is_win, mult = check_bet_win("even_money", "19 to 36", 25)
    assert is_win is True
    assert mult == 1

def test_roulette_dozens():
    is_win, mult = check_bet_win("dozen", "1st12", 9)
    assert is_win is True
    assert mult == 2

    is_win, mult = check_bet_win("dozen", "2nd12", 15)
    assert is_win is True
    assert mult == 2

    is_win, mult = check_bet_win("dozen", "3rd12", 30)
    assert is_win is True
    assert mult == 2

def test_roulette_columns():
    # Col 1: 1, 4, 7, 10, 13... (rem == 1)
    is_win, mult = check_bet_win("column", "col1", 10)
    assert is_win is True
    assert mult == 2

    # Col 2: 2, 5, 8, 11, 14... (rem == 2)
    is_win, mult = check_bet_win("column", "col2", 14)
    assert is_win is True
    assert mult == 2

    # Col 3: 3, 6, 9, 12, 15... (rem == 0)
    is_win, mult = check_bet_win("column", "col3", 30)
    assert is_win is True
    assert mult == 2

def test_roulette_split_street_corner():
    # Split 1,2
    is_win, mult = check_bet_win("split", "1,2", 1)
    assert is_win is True
    assert mult == 17

    # Street 1,2,3
    is_win, mult = check_bet_win("street", "1,2,3", 3)
    assert is_win is True
    assert mult == 11

    # Corner 1,2,4,5
    is_win, mult = check_bet_win("corner", "1,2,4,5", 4)
    assert is_win is True
    assert mult == 8

    # Six line 1..6
    is_win, mult = check_bet_win("six_line", "1,2,3,4,5,6", 6)
    assert is_win is True
    assert mult == 5

def test_roulette_engine_state():
    state = roulette_engine.get_state()
    assert "round_id" in state
    assert state["phase"] in ("BETTING", "STOP_BETTING", "SPINNING", "RESULT")
    assert "history" in state
    assert len(state["history"]) > 0
    assert "vip_players" in state
