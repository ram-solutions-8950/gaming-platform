import pytest
from uuid import uuid4
from sqlalchemy.orm import Session

from app.models.user import User, UserRole, UserStatus
from app.models.wallet import Wallet
from app.security.jwt import create_access_token
from app.services.roulette.engine import roulette_engine

@pytest.fixture
def user_with_wallet(db: Session):
    rand = str(uuid4())[:8]
    u = User(
        id=uuid4(),
        name="Roulette Player",
        username=f"roulette_{rand}",
        email=f"roulette_{rand}@example.com",
        password_hash="fake",
        role=UserRole.USER,
        status=UserStatus.ACTIVE
    )
    db.add(u)
    db.flush()

    # Add 10,000 INR (1,000,000 paise)
    w = Wallet(
        user_id=u.id,
        balance=1000000
    )
    db.add(w)
    db.commit()

    token = create_access_token(str(u.id), u.role.value)
    return {"Authorization": f"Bearer {token}"}, u

def test_roulette_state_api(client, user_with_wallet):
    headers, _ = user_with_wallet
    res = client.get("/api/v1/games/roulette/state", headers=headers)
    assert res.status_code == 200
    data = res.json()["data"]
    assert "round_id" in data
    assert "phase" in data
    assert "seconds_left" in data
    assert "history" in data
    assert "vip_players" in data

def test_roulette_bet_and_clear_api(client, user_with_wallet):
    headers, user = user_with_wallet

    # Ensure engine is in BETTING phase for deterministic test
    roulette_engine.current_round.started_at = 0  # will cause update
    roulette_engine.current_round = type(roulette_engine.current_round)(str(uuid4()))
    roulette_engine.current_round.started_at = __import__("time").time() # brand new betting phase

    # Place bet on Red
    bet_payload = {
        "bets": [
            {"bet_type": "even_money", "target": "red", "amount": 100},
            {"bet_type": "straight", "target": "17", "amount": 50}
        ]
    }
    res = client.post("/api/v1/games/roulette/bet", json=bet_payload, headers=headers)
    assert res.status_code == 200
    assert res.json()["data"]["success"] is True

    # Check state reflects bets
    state_res = client.get("/api/v1/games/roulette/state", headers=headers)
    state = state_res.json()["data"]
    assert len(state["my_bets"]) >= 2
    assert state["my_total_bet_inr"] == 150.0

    # Clear bets
    clear_res = client.post("/api/v1/games/roulette/clear", headers=headers)
    assert clear_res.status_code == 200
    assert clear_res.json()["data"]["refunded_inr"] == 150.0

    # Check state reflects cleared bets
    state_res2 = client.get("/api/v1/games/roulette/state", headers=headers)
    assert len(state_res2.json()["data"]["my_bets"]) == 0
    assert state_res2.json()["data"]["my_total_bet_inr"] == 0.0

def test_roulette_history_api(client, user_with_wallet):
    headers, _ = user_with_wallet
    res = client.get("/api/v1/games/roulette/history", headers=headers)
    assert res.status_code == 200
    data = res.json()["data"]
    assert "history" in data
    assert isinstance(data["history"], list)
