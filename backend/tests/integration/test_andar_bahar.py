import pytest
from datetime import datetime, timezone, timedelta
from uuid import uuid4
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.models.user import User, UserRole, UserStatus
from app.models.wallet import Wallet
from app.models.transaction import WalletTransaction, WalletTransactionType
from app.models.game import GameRound, GameRoundStatus, GameBet, GameBetStatus
from app.models.game_catalog import Game, GameStatus
from app.models.fee_configuration import FeeConfiguration
from app.services.game_engines.andar_bahar import AndarBaharEngine, deal_round, Card


engine = AndarBaharEngine()


@pytest.fixture
def auth_user(db: Session):
    rand_suffix = str(uuid4())[:8]
    user = User(
        id=uuid4(),
        name="AB User",
        username=f"abuser_{rand_suffix}",
        email=f"abuser_{rand_suffix}@example.com",
        password_hash="fakehash",
        role=UserRole.USER,
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    wallet = Wallet(id=uuid4(), user_id=user.id, balance=1000000)  # 10,000 INR in paise
    db.add(wallet)
    db.commit()
    from app.security.jwt import create_access_token
    token = create_access_token(str(user.id), user.role.value)
    return {"Authorization": f"Bearer {token}"}, user, wallet


@pytest.fixture
def fee_config(db: Session):
    config = db.query(FeeConfiguration).first()
    if not config:
        config = FeeConfiguration(game_entry_fee_percent=Decimal("5.00"), winning_fee_percent=Decimal("10.00"))
        db.add(config)
    else:
        config.game_entry_fee_percent = Decimal("5.00")
        config.winning_fee_percent = Decimal("10.00")
    db.commit()
    return config


@pytest.fixture
def ab_game(db: Session):
    game = engine._get_or_create_game(db)
    game.status = GameStatus.ACTIVE
    game.min_bet = 1000
    game.max_bet = 500000
    db.commit()
    return game


def test_andar_bahar_game_exists(db: Session, ab_game):
    assert ab_game.slug == "andar-bahar"
    assert ab_game.status == GameStatus.ACTIVE
    assert ab_game.config["allowed_bets"]["andar"] is True
    assert ab_game.config["allowed_bets"]["bahar"] is True


def test_create_round_initializes_properly(db: Session, ab_game):
    rd = engine.create_round(db)
    assert rd.status == GameRoundStatus.BETTING
    assert rd.game_id == ab_game.id
    assert rd.betting_closes_at > datetime.now(timezone.utc)
    assert rd.result_data is None


def test_place_bet_deducts_wallet(db: Session, auth_user, ab_game, fee_config):
    _, user, wallet = auth_user
    rd = engine.create_round(db)
    initial_balance = wallet.balance

    bet = engine.place_bet(
        db,
        user_id=user.id,
        round_id=rd.id,
        prediction="ANDAR",
        amount=10000,
    )

    db.refresh(wallet)
    assert bet.status == GameBetStatus.PENDING
    assert bet.amount == 10000
    assert bet.entry_fee_amount == 500  # 5% of 10000
    assert bet.stake_amount == 9500
    assert wallet.balance == initial_balance - 10000

    tx = db.query(WalletTransaction).filter(
        WalletTransaction.reference_id == str(bet.id),
        WalletTransaction.type == WalletTransactionType.GAME_ENTRY,
    ).first()
    assert tx is not None
    assert tx.amount == 10000


def test_place_bet_rejects_invalid_prediction(db: Session, auth_user, ab_game):
    _, user, _ = auth_user
    rd = engine.create_round(db)

    with pytest.raises(ValueError, match="Invalid bet type"):
        engine.place_bet(
            db,
            user_id=user.id,
            round_id=rd.id,
            prediction="DRAGON",
            amount=10000,
        )


def test_place_bet_rejects_expired_betting_window(db: Session, auth_user, ab_game):
    _, user, _ = auth_user
    rd = engine.create_round(db)
    rd.betting_closes_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db.commit()

    with pytest.raises(ValueError, match="Betting window has expired"):
        engine.place_bet(
            db,
            user_id=user.id,
            round_id=rd.id,
            prediction="ANDAR",
            amount=10000,
        )


def test_place_bet_rejects_locked_round(db: Session, auth_user, ab_game):
    _, user, _ = auth_user
    rd = engine.create_round(db)
    engine.lock_round_for_calculation(db, rd.id)

    with pytest.raises(ValueError, match="Betting is closed for this round"):
        engine.place_bet(
            db,
            user_id=user.id,
            round_id=rd.id,
            prediction="ANDAR",
            amount=10000,
        )


def test_server_authoritative_settlement_andar_wins(db: Session, auth_user, ab_game, fee_config):
    _, user, wallet = auth_user
    rd = engine.create_round(db)

    bet = engine.place_bet(
        db,
        user_id=user.id,
        round_id=rd.id,
        prediction="ANDAR",
        amount=10000,  # entry fee 500, stake 9500
    )
    balance_after_bet = wallet.balance

    # Predetermined deal where ANDAR wins (middle card 7-S, andar card 7-D)
    predetermined_deal = {
        "middle": {"rank": 7, "suit": "S", "label": "7♠"},
        "startSide": "andar",
        "steps": [{"side": "andar", "card": {"rank": 7, "suit": "D", "label": "7♦"}}],
        "andar": [{"rank": 7, "suit": "D", "label": "7♦"}],
        "bahar": [],
        "winner": "ANDAR",
        "result": "ANDAR",
        "cardsDealt": 1,
    }

    settled_rd = engine.settle_round(db, rd.id, predetermined_deal=predetermined_deal)
    db.refresh(bet)
    db.refresh(wallet)

    assert settled_rd.status == GameRoundStatus.COMPLETED
    assert settled_rd.result_data["winner"] == "ANDAR"
    assert bet.status == GameBetStatus.WON
    # Gross return: 9500 + round(9500 * 0.9) = 9500 + 8550 = 18050
    # Net profit: 8550 -> 10% fee = 855 -> Final credit = 18050 - 855 = 17195
    assert bet.gross_win_amount == 18050
    assert bet.winning_fee_amount == 855
    assert bet.net_win_amount == 17195
    assert wallet.balance == balance_after_bet + 17195


def test_server_authoritative_settlement_bahar_wins(db: Session, auth_user, ab_game, fee_config):
    _, user, wallet = auth_user
    rd = engine.create_round(db)

    bet = engine.place_bet(
        db,
        user_id=user.id,
        round_id=rd.id,
        prediction="BAHAR",
        amount=10000,  # entry fee 500, stake 9500
    )
    balance_after_bet = wallet.balance

    # Predetermined deal where BAHAR wins
    predetermined_deal = {
        "middle": {"rank": 10, "suit": "H", "label": "10♥"},
        "startSide": "bahar",
        "steps": [{"side": "bahar", "card": {"rank": 10, "suit": "S", "label": "10♠"}}],
        "andar": [],
        "bahar": [{"rank": 10, "suit": "S", "label": "10♠"}],
        "winner": "BAHAR",
        "result": "BAHAR",
        "cardsDealt": 1,
    }

    settled_rd = engine.settle_round(db, rd.id, predetermined_deal=predetermined_deal)
    db.refresh(bet)
    db.refresh(wallet)

    assert settled_rd.status == GameRoundStatus.COMPLETED
    assert bet.status == GameBetStatus.WON
    # Gross return: 9500 + (9500 * 1.0) = 19000
    # Net profit: 9500 -> 10% fee = 950 -> Final credit = 19000 - 950 = 18050
    assert bet.gross_win_amount == 19000
    assert bet.winning_fee_amount == 950
    assert bet.net_win_amount == 18050
    assert wallet.balance == balance_after_bet + 18050


def test_settlement_losing_bet(db: Session, auth_user, ab_game):
    _, user, wallet = auth_user
    rd = engine.create_round(db)

    bet = engine.place_bet(
        db,
        user_id=user.id,
        round_id=rd.id,
        prediction="ANDAR",
        amount=5000,
    )
    balance_after_bet = wallet.balance

    predetermined_deal = {
        "middle": {"rank": 10, "suit": "H", "label": "10♥"},
        "startSide": "bahar",
        "steps": [{"side": "bahar", "card": {"rank": 10, "suit": "S", "label": "10♠"}}],
        "andar": [],
        "bahar": [{"rank": 10, "suit": "S", "label": "10♠"}],
        "winner": "BAHAR",
        "result": "BAHAR",
        "cardsDealt": 1,
    }

    engine.settle_round(db, rd.id, predetermined_deal=predetermined_deal)
    db.refresh(bet)
    db.refresh(wallet)

    assert bet.status == GameBetStatus.LOST
    assert bet.net_win_amount == 0
    assert wallet.balance == balance_after_bet  # no additional credit on loss


def test_idempotent_settlement(db: Session, auth_user, ab_game):
    _, user, wallet = auth_user
    rd = engine.create_round(db)

    engine.place_bet(db, user_id=user.id, round_id=rd.id, prediction="ANDAR", amount=5000)

    predetermined_deal = {
        "middle": {"rank": 5, "suit": "S", "label": "5♠"},
        "startSide": "andar",
        "steps": [{"side": "andar", "card": {"rank": 5, "suit": "H", "label": "5♥"}}],
        "andar": [{"rank": 5, "suit": "H", "label": "5♥"}],
        "bahar": [],
        "winner": "ANDAR",
        "result": "ANDAR",
        "cardsDealt": 1,
    }

    first = engine.settle_round(db, rd.id, predetermined_deal=predetermined_deal)
    balance_after_first = wallet.balance

    second = engine.settle_round(db, rd.id, predetermined_deal=predetermined_deal)
    db.refresh(wallet)

    assert first.id == second.id
    assert wallet.balance == balance_after_first  # No double crediting
