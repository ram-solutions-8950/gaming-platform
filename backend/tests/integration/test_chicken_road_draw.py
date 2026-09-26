"""Chicken Road outcomes are decided by the server's draw, never by the client."""
import random
import uuid
from uuid import uuid4

import pytest

import app.routers.chicken_road as chicken_road
from app.models.user import User, UserRole, UserStatus
from app.models.wallet import Wallet
from app.security.jwt import create_access_token
from app.routers.chicken_road import CHICKEN_ROAD_RTP, DIFFICULTY_MULTIPLIERS, draw_hit_lane
from app.services.wallet_service import get_balance


@pytest.fixture
def auth_user(db):
    user = User(id=uuid4(), name="Draw Tester", username=f"draw_{uuid4().hex[:8]}",
                email=f"draw_{uuid4().hex[:8]}@example.com", password_hash="x",
                role=UserRole.USER, status=UserStatus.ACTIVE)
    db.add(user)
    db.add(Wallet(id=uuid4(), user_id=user.id, balance=500000))
    db.commit()
    token = create_access_token(str(user.id), user.role.value)
    return {"user": user, "headers": {"Authorization": f"Bearer {token}"}}


def test_every_cash_out_point_returns_the_rtp(monkeypatch):
    monkeypatch.setattr(chicken_road, "_rng", random.Random(99))
    draws = 200_000
    for multipliers in DIFFICULTY_MULTIPLIERS.values():
        hits = [draw_hit_lane(multipliers) for _ in range(draws)]
        for lane, mult in enumerate(multipliers, start=1):
            survived = sum(1 for h in hits if h is None or h > lane) / draws
            # cashing out after this lane pays mult; on average that is the RTP
            assert abs(survived * mult - CHICKEN_ROAD_RTP) < 0.012, (lane, mult, survived * mult)


def _start(client, headers, monkeypatch, hit_lane, difficulty="HARD"):
    monkeypatch.setattr(chicken_road, "draw_hit_lane", lambda multipliers: hit_lane)
    res = client.post("/api/v1/games/chicken-road/start", json={"bet_amount": 100, "difficulty": difficulty}, headers=headers)
    assert res.status_code == 200, res.text
    return res.json()["data"]["round_id"]


def test_client_cannot_cash_out_past_the_lane_it_is_hit_on(client, auth_user, db, monkeypatch):
    user, headers = auth_user["user"], auth_user["headers"]
    before = get_balance(db, user.id).balance
    round_id = _start(client, headers, monkeypatch, hit_lane=3)

    # A tampered client claims it crossed every lane and cashes out at the top
    res = client.post("/api/v1/games/chicken-road/cashout", json={"round_id": round_id, "lane_index": 10}, headers=headers)
    body = res.json()["data"]
    assert body["status"] == "LOST" and body["lane_index"] == 3 and body["won_amount"] == 0

    db.expire_all()
    assert get_balance(db, user.id).balance == before - 10000


def test_finishing_the_road_goes_through_the_draw(client, auth_user, db, monkeypatch):
    user, headers = auth_user["user"], auth_user["headers"]
    round_id = _start(client, headers, monkeypatch, hit_lane=7)
    res = client.post("/api/v1/games/chicken-road/finish", json={"round_id": round_id}, headers=headers)
    assert res.json()["data"]["status"] == "LOST"

    before = get_balance(db, user.id).balance
    round_id = _start(client, headers, monkeypatch, hit_lane=None)
    res = client.post("/api/v1/games/chicken-road/finish", json={"round_id": round_id}, headers=headers)
    body = res.json()["data"]
    assert body["status"] == "WON" and body["multiplier"] == 10.0
    db.expire_all()
    assert get_balance(db, user.id).balance == before - 10000 + body["won_amount"] * 100


def test_crossing_stops_at_the_hit_lane(client, auth_user, monkeypatch):
    headers = auth_user["headers"]
    round_id = _start(client, headers, monkeypatch, hit_lane=2)
    first = client.post("/api/v1/games/chicken-road/cross-lane", json={"round_id": round_id, "lane_index": 1}, headers=headers)
    assert first.json()["data"]["status"] == "ACTIVE"
    second = client.post("/api/v1/games/chicken-road/cross-lane", json={"round_id": round_id, "lane_index": 2}, headers=headers)
    assert second.json()["data"]["status"] == "LOST"
    # the round is over: nothing can be cashed out
    res = client.post("/api/v1/games/chicken-road/cashout", json={"round_id": round_id}, headers=headers)
    assert res.status_code == 400



def _round(db, round_id):
    from app.models.chicken_road import ChickenRoadRound
    db.expire_all()
    return db.get(ChickenRoadRound, uuid.UUID(round_id))


def test_rounds_are_recorded_in_the_database(client, auth_user, db, monkeypatch):
    headers = auth_user["headers"]
    base = "/api/v1/games/chicken-road"

    lost = _start(client, headers, monkeypatch, hit_lane=2)
    client.post(f"{base}/cross-lane", json={"round_id": lost, "lane_index": 1}, headers=headers)
    # Nothing is held in memory: the round in play comes back from the database.
    state = client.get(f"{base}/state", headers=headers).json()["data"]
    assert state["round_id"] == lost and state["current_lane"] == 1
    assert "hit_lane" not in state
    client.post(f"{base}/cross-lane", json={"round_id": lost, "lane_index": 2}, headers=headers)
    rnd = _round(db, lost)
    assert (rnd.status, rnd.lost_lane, rnd.current_lane, rnd.payout) == ("LOST", 2, 1, 0)

    cashed = _start(client, headers, monkeypatch, hit_lane=None)
    client.post(f"{base}/cross-lane", json={"round_id": cashed, "lane_index": 3}, headers=headers)
    body = client.post(f"{base}/cashout", json={"round_id": cashed}, headers=headers).json()["data"]
    rnd = _round(db, cashed)
    assert (rnd.status, rnd.multiplier, rnd.payout) == ("CASHED_OUT", 1.30, int(body["won_amount"] * 100))

    won = _start(client, headers, monkeypatch, hit_lane=None)
    client.post(f"{base}/finish", json={"round_id": won}, headers=headers)
    assert _round(db, won).status == "WON"
    assert client.get(f"{base}/state", headers=headers).json()["data"]["status"] == "READY"

    # A settled round can't be settled again.
    assert client.post(f"{base}/cashout", json={"round_id": won}, headers=headers).status_code == 400


def test_one_round_in_play_per_player(client, auth_user, monkeypatch):
    headers = auth_user["headers"]
    _start(client, headers, monkeypatch, hit_lane=None)
    res = client.post("/api/v1/games/chicken-road/start", json={"bet_amount": 10, "difficulty": "MEDIUM"}, headers=headers)
    assert res.status_code == 400


def test_no_round_without_its_stake(client, db, monkeypatch):
    from app.models.chicken_road import ChickenRoadRound
    user = User(id=uuid4(), name="Broke", username=f"broke_{uuid4().hex[:8]}",
                email=f"broke_{uuid4().hex[:8]}@example.com", password_hash="x",
                role=UserRole.USER, status=UserStatus.ACTIVE)
    db.add(user)
    db.add(Wallet(id=uuid4(), user_id=user.id, balance=500))  # ₹5: below the minimum bet
    db.commit()
    headers = {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}
    res = client.post("/api/v1/games/chicken-road/start", json={"bet_amount": 10, "difficulty": "MEDIUM"}, headers=headers)
    assert res.status_code == 400
    assert db.query(ChickenRoadRound).filter(ChickenRoadRound.user_id == user.id).count() == 0


def test_cash_out_amount_shown_is_what_is_paid(client, auth_user, db, monkeypatch):
    from app.models.fee_configuration import FeeConfiguration
    cfg = db.query(FeeConfiguration).first()
    if cfg is None:
        cfg = FeeConfiguration()
        db.add(cfg)
        db.commit()
    saved = cfg.game_commission_overrides
    cfg.game_commission_overrides = {"chicken-road": 10}
    db.commit()
    try:
        headers = auth_user["headers"]
        round_id = _start(client, headers, monkeypatch, hit_lane=None, difficulty="MEDIUM")
        crossed = client.post("/api/v1/games/chicken-road/cross-lane",
                              json={"round_id": round_id, "lane_index": 2}, headers=headers).json()["data"]
        # ₹100 at 1.08x: ₹8 profit, 10% fee on it → ₹107.20
        assert crossed["cashout_amount"] == 107.20
        paid = client.post("/api/v1/games/chicken-road/cashout",
                           json={"round_id": round_id}, headers=headers).json()["data"]
        assert paid["won_amount"] == crossed["cashout_amount"]
    finally:
        cfg.game_commission_overrides = saved
        db.commit()
