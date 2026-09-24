"""
Stakes that are in play when the server stops are never lost: round games are
settled on the next start, flights that never finished and roulette rounds that
never settled are refunded. Also: Aviator auto-cashouts at the crash boundary.
"""
import uuid
from datetime import datetime, timezone, timedelta

import pytest
from sqlalchemy.orm import sessionmaker

from app.models.aviator import AviatorBet, AviatorBetStatus, AviatorRound, AviatorRoundStatus
from app.models.game import GameBet, GameBetStatus, GameRound, GameRoundStatus
from app.models.user import User, UserRole, UserStatus
from app.models.wallet import Wallet
from app.services import game_engine
from app.services.aviator import engine as aviator_module
from app.services.game_engines import get_engine
from app.services.wallet_service import get_balance


@pytest.fixture
def player(db):
    u = User(id=uuid.uuid4(), name="Recover", username=f"rec_{uuid.uuid4().hex[:8]}",
             email=f"rec_{uuid.uuid4().hex[:8]}@example.com", password_hash="x",
             role=UserRole.USER, status=UserStatus.ACTIVE)
    db.add(u)
    db.add(Wallet(id=uuid.uuid4(), user_id=u.id, balance=100000))
    db.commit()
    return u


def _balance(db, user):
    db.expire_all()
    return get_balance(db, user.id).balance


def test_round_left_open_by_a_restart_is_settled_on_start(db, player, monkeypatch):
    monkeypatch.setattr(game_engine, "SessionLocal", sessionmaker(autocommit=False, autoflush=False, bind=db.get_bind()))
    engine = get_engine("dragon-tiger")
    rd = engine.create_round(db)
    engine.place_bet(db, player.id, rd.id, "DRAGON", 10000)

    game_engine._settle_interrupted_rounds(engine)

    db.expire_all()
    assert db.get(GameRound, rd.id).status == GameRoundStatus.COMPLETED
    bet = db.query(GameBet).filter(GameBet.round_id == rd.id).one()
    assert bet.status in (GameBetStatus.WON, GameBetStatus.LOST)


def test_aviator_flight_cut_off_by_a_restart_refunds_live_bets(db, player):
    rnd = AviatorRound(id=uuid.uuid4(), nonce=1, server_seed_hash="h", status=AviatorRoundStatus.FLYING,
                       betting_started_at=datetime.now(timezone.utc))
    db.add(rnd)
    db.add(AviatorBet(id=uuid.uuid4(), user_id=player.id, round_id=rnd.id, slot=1, amount=5000,
                      status=AviatorBetStatus.ACTIVE))
    get_balance(db, player.id).balance -= 5000  # the stake was taken when the bet was placed
    db.commit()

    aviator_module.AviatorEngine().void_unfinished_rounds(db)

    db.expire_all()
    assert _balance(db, player) == 100000
    bet = db.query(AviatorBet).filter(AviatorBet.round_id == rnd.id).one()
    assert bet.status == AviatorBetStatus.CASHED_OUT and bet.payout == 5000
    assert db.get(AviatorRound, rnd.id).status == AviatorRoundStatus.SETTLED


def test_aviator_auto_cashout_just_below_the_crash_is_paid(db, player, monkeypatch):
    monkeypatch.setattr(aviator_module, "compute_crash_point", lambda seed, nonce: 2.0)
    eng = aviator_module.AviatorEngine()
    eng._recent_crash_points = [1.5]
    rnd = eng.create_round(db)
    eng.place_bet(db, player.id, slot=1, amount=10000, auto_cashout=1.99)
    eng.start_flight(db)
    # The last tick landed before 1.99x and the plane crashed at 2.00x
    rnd.flight_started_at = datetime.now(timezone.utc) - timedelta(milliseconds=1)

    paid = eng.process_auto_cashouts(db, at_crash=True)
    eng.crash_round(db)

    assert [round(m, 2) for _, m in paid] == [1.99]
    bet = rnd.bets[0]
    assert bet.payout == 19900
    assert _balance(db, player) == 100000 - 10000 + 19900


def test_roulette_round_open_at_shutdown_refunds_its_bets(db, player, monkeypatch):
    from app.services.roulette import engine as roulette_module
    monkeypatch.setattr(roulette_module, "SessionLocal", sessionmaker(autocommit=False, autoflush=False, bind=db.get_bind()))
    eng = roulette_module.roulette_engine
    with eng.lock:
        eng.current_round = roulette_module.RouletteRound(str(uuid.uuid4()))
    eng.place_bets(db, player, [{"bet_type": "straight", "target": "7", "amount": 50}])
    assert _balance(db, player) == 100000 - 5000

    roulette_module.refund_open_round()

    assert _balance(db, player) == 100000
