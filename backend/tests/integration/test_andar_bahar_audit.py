import pytest
import asyncio
from datetime import datetime, timezone, timedelta
from uuid import uuid4
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.models.user import User, UserRole, UserStatus
from app.models.wallet import Wallet
from app.models.transaction import WalletTransaction, WalletTransactionType
from app.models.game import GameRound, GameRoundStatus, GameBet, GameBetStatus, GamePrediction
from app.models.game_catalog import Game, GameStatus
from app.models.fee_configuration import FeeConfiguration
from app.services.game_engines.andar_bahar import AndarBaharEngine, deal_round
from app.services.wallet_service import debit_wallet, credit_wallet

engine = AndarBaharEngine()


@pytest.fixture
def audit_user(db: Session):
    rand_suffix = str(uuid4())[:8]
    user = User(
        id=uuid4(),
        name="Audit User",
        username=f"audit_{rand_suffix}",
        email=f"audit_{rand_suffix}@example.com",
        password_hash="fakehash",
        role=UserRole.USER,
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    wallet = Wallet(id=uuid4(), user_id=user.id, balance=500000)  # 5,000 INR
    db.add(wallet)
    db.commit()
    return user, wallet


@pytest.fixture
def audit_game(db: Session):
    game = engine._get_or_create_game(db)
    game.status = GameStatus.ACTIVE
    game.min_bet = 1000
    game.max_bet = 500000
    db.commit()
    return game


# 1. DATABASE AUDIT
def test_database_enum_and_catalog(db: Session, audit_game):
    # Verify enum values in DB
    result = db.execute(
        text("SELECT enumlabel FROM pg_enum WHERE enumtypid = 'game_prediction'::regtype")
    ).fetchall()
    enum_labels = [row[0] for row in result]
    assert "ANDAR" in enum_labels, "ANDAR enum missing"
    assert "BAHAR" in enum_labels, "BAHAR enum missing"

    # Verify games present
    games = db.query(Game).all()
    slugs = [g.slug for g in games]
    assert "andar-bahar" in slugs

    # Verify Andar Bahar catalog entry
    ab = db.query(Game).filter(Game.slug == "andar-bahar").first()
    assert ab is not None
    assert ab.status == GameStatus.ACTIVE
    assert ab.config["allowed_bets"]["andar"] is True
    assert ab.config["allowed_bets"]["bahar"] is True


# 2. WALLET CONCURRENCY & IDEMPOTENCY AUDIT
def test_wallet_duplicate_reference_protection(db: Session, audit_user, audit_game):
    user, wallet = audit_user
    rd = engine.create_round(db)
    ref_id = str(uuid4())

    # First debit should succeed
    debit_wallet(
        db,
        user_id=user.id,
        amount=10000,
        tx_type=WalletTransactionType.GAME_ENTRY,
        reference_type="game_bet",
        reference_id=ref_id,
    )
    db.refresh(wallet)
    assert wallet.balance == 490000

    # Duplicate debit with same reference ID must be rejected
    with pytest.raises(ValueError, match="Duplicate transaction reference"):
        debit_wallet(
            db,
            user_id=user.id,
            amount=10000,
            tx_type=WalletTransactionType.GAME_ENTRY,
            reference_type="game_bet",
            reference_id=ref_id,
        )
    db.refresh(wallet)
    assert wallet.balance == 490000  # Balance untouched, no double debit


def test_no_double_settlement_on_multiple_calls(db: Session, audit_user, audit_game):
    user, wallet = audit_user
    rd = engine.create_round(db)

    bet = engine.place_bet(
        db,
        user_id=user.id,
        round_id=rd.id,
        prediction="ANDAR",
        amount=10000,
    )
    balance_after_bet = wallet.balance

    predetermined_deal = {
        "middle": {"rank": 3, "suit": "S", "label": "3♠"},
        "startSide": "andar",
        "steps": [{"side": "andar", "card": {"rank": 3, "suit": "H", "label": "3♥"}}],
        "andar": [{"rank": 3, "suit": "H", "label": "3♥"}],
        "bahar": [],
        "winner": "ANDAR",
        "result": "ANDAR",
        "cardsDealt": 1,
    }

    # Settle round first time
    settled_1 = engine.settle_round(db, rd.id, predetermined_deal=predetermined_deal)
    db.refresh(wallet)
    balance_after_settle_1 = wallet.balance
    assert balance_after_settle_1 > balance_after_bet

    # Settle round second time (should be idempotent NO-OP)
    settled_2 = engine.settle_round(db, rd.id, predetermined_deal=predetermined_deal)
    db.refresh(wallet)
    balance_after_settle_2 = wallet.balance

    assert settled_1.id == settled_2.id
    assert balance_after_settle_1 == balance_after_settle_2, "Double settlement occurred!"


# 3. ROUND SECURITY AUDIT
def test_security_rejects_bet_after_closing(db: Session, audit_user, audit_game):
    user, _ = audit_user
    rd = engine.create_round(db)

    # Move betting_closes_at to the past
    rd.betting_closes_at = datetime.now(timezone.utc) - timedelta(seconds=2)
    db.commit()

    with pytest.raises(ValueError, match="Betting window has expired"):
        engine.place_bet(
            db,
            user_id=user.id,
            round_id=rd.id,
            prediction="ANDAR",
            amount=5000,
        )


def test_security_rejects_bet_in_calculating_status(db: Session, audit_user, audit_game):
    user, _ = audit_user
    rd = engine.create_round(db)
    engine.lock_round_for_calculation(db, rd.id)

    with pytest.raises(ValueError, match="Betting is closed for this round"):
        engine.place_bet(
            db,
            user_id=user.id,
            round_id=rd.id,
            prediction="BAHAR",
            amount=5000,
        )


def test_security_server_authoritative_deal_rules(db: Session):
    # Test 50 deals to verify server deal invariants
    for _ in range(50):
        deal = deal_round()
        assert "middle" in deal
        assert "winner" in deal
        assert deal["winner"] in ("ANDAR", "BAHAR")
        assert deal["cardsDealt"] == len(deal["steps"])

        # Middle card rank must match the last dealt step card rank
        last_step = deal["steps"][-1]
        assert last_step["card"]["rank"] == deal["middle"]["rank"]
        assert last_step["side"].upper() == deal["winner"]


# 4. HISTORY & PERSISTENCE AUDIT
def test_round_and_transaction_history_persistence(db: Session, audit_user, audit_game):
    user, wallet = audit_user
    rd = engine.create_round(db)

    bet = engine.place_bet(
        db,
        user_id=user.id,
        round_id=rd.id,
        prediction="BAHAR",
        amount=10000,
    )

    predetermined_deal = {
        "middle": {"rank": 8, "suit": "D", "label": "8♦"},
        "startSide": "bahar",
        "steps": [{"side": "bahar", "card": {"rank": 8, "suit": "C", "label": "8♣"}}],
        "andar": [],
        "bahar": [{"rank": 8, "suit": "C", "label": "8♣"}],
        "winner": "BAHAR",
        "result": "BAHAR",
        "cardsDealt": 1,
    }

    engine.settle_round(db, rd.id, predetermined_deal=predetermined_deal)

    # Verify round persisted in history query
    history = engine.get_round_history(db, limit=10)
    round_ids = [r.id for r in history]
    assert rd.id in round_ids

    persisted_rd = db.query(GameRound).filter(GameRound.id == rd.id).first()
    assert persisted_rd.status == GameRoundStatus.COMPLETED
    assert persisted_rd.result_data["winner"] == "BAHAR"

    # Verify transactions in wallet history
    tx_entry = (
        db.query(WalletTransaction)
        .filter(
            WalletTransaction.user_id == user.id,
            WalletTransaction.type == WalletTransactionType.GAME_ENTRY,
            WalletTransaction.reference_id == str(bet.id),
        )
        .first()
    )
    assert tx_entry is not None
    assert tx_entry.amount == 10000

    tx_win = (
        db.query(WalletTransaction)
        .filter(
            WalletTransaction.user_id == user.id,
            WalletTransaction.type == WalletTransactionType.GAME_WIN,
            WalletTransaction.reference_id == str(bet.id),
        )
        .first()
    )
    assert tx_win is not None
    assert tx_win.amount > 0
