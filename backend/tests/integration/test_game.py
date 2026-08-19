import pytest
import asyncio
from datetime import datetime, timezone, timedelta
from uuid import uuid4
from decimal import Decimal
from sqlalchemy.orm import Session

from app.models.user import User, UserRole, UserStatus
from app.models.wallet import Wallet
from app.models.transaction import WalletTransaction, WalletTransactionType
from app.models.game import GameRound, GameRoundStatus, GameColor, GamePrediction, GameBet, GameBetStatus
from app.models.fee_configuration import FeeConfiguration

from app.services.game_service import (
    create_round, get_current_round, place_bet, settle_round, lock_round_for_calculation,
    ROUND_DURATION_SECONDS, BETTING_WINDOW_SECONDS
)

# Test Fixtures

@pytest.fixture
def auth_headers(client, db: Session):
    # Create user
    rand_suffix = str(uuid4())[:8]
    user = User(
        id=uuid4(),
        name="Test User",
        username=f"testuser_{rand_suffix}",
        email=f"testuser_{rand_suffix}@example.com",
        password_hash="fakehash",
        role=UserRole.USER,
        status=UserStatus.ACTIVE
    )
    db.add(user)
    
    # Create wallet
    wallet = Wallet(id=uuid4(), user_id=user.id, balance=1000000) # 10000 INR
    db.add(wallet)
    db.commit()
    
    # Return auth token (we can mock the token using the actual auth router or just create one)
    from app.security.jwt import create_access_token
    token = create_access_token(str(user.id), user.role.value)
    return {"Authorization": f"Bearer {token}"}, user, wallet

@pytest.fixture
def admin_headers(client, db: Session):
    rand_suffix = str(uuid4())[:8]
    admin = User(
        id=uuid4(),
        name="Admin User",
        username=f"adminuser_{rand_suffix}",
        email=f"admin_{rand_suffix}@example.com",
        password_hash="fakehash",
        role=UserRole.ADMIN,
        status=UserStatus.ACTIVE
    )
    db.add(admin)
    db.commit()
    from app.security.jwt import create_access_token
    token = create_access_token(str(admin.id), admin.role.value)
    return {"Authorization": f"Bearer {token}"}, admin

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

# ── ROUND TESTS ──────────────────────────────────────────────────

def test_create_round(db: Session):
    round1 = create_round(db)
    assert round1.status == GameRoundStatus.BETTING
    assert round1.id is not None
    assert round1.started_at is not None
    assert round1.betting_closes_at is not None
    assert round1.betting_closes_at > round1.started_at

def test_bets_accepted_during_betting(db: Session, auth_headers):
    headers, user, wallet = auth_headers
    round1 = create_round(db)
    
    bet = place_bet(db, user.id, round1.id, "RED", 10000)
    assert bet.status == GameBetStatus.PENDING
    assert bet.amount == 10000

def test_bets_rejected_when_calculating(db: Session, auth_headers):
    headers, user, wallet = auth_headers
    round1 = create_round(db)
    lock_round_for_calculation(db, round1.id)
    
    with pytest.raises(ValueError, match="Betting is closed for this round"):
        place_bet(db, user.id, round1.id, "RED", 10000)

def test_completed_round_cannot_accept_bet(db: Session, auth_headers):
    headers, user, wallet = auth_headers
    round1 = create_round(db)
    lock_round_for_calculation(db, round1.id)
    settle_round(db, round1.id)
    
    with pytest.raises(ValueError, match="Betting is closed for this round"):
        place_bet(db, user.id, round1.id, "RED", 10000)

def test_completed_round_cannot_be_settled_again(db: Session):
    round1 = create_round(db)
    lock_round_for_calculation(db, round1.id)
    r1 = settle_round(db, round1.id)
    assert r1.status == GameRoundStatus.COMPLETED
    
    r2 = settle_round(db, round1.id)
    assert r2.status == GameRoundStatus.COMPLETED
    # Ensuring idempotency
    
def test_result_is_persisted_and_immutable(db: Session):
    round1 = create_round(db)
    lock_round_for_calculation(db, round1.id)
    r = settle_round(db, round1.id)
    assert r.result_color is not None
    assert r.result_number is not None
    
    # Try fetching again
    fetched = db.query(GameRound).filter(GameRound.id == round1.id).first()
    assert fetched.result_color == r.result_color
    assert fetched.result_number == r.result_number

# ── BET / WALLET TESTS ──────────────────────────────────────────────────

def test_valid_bet_debits_wallet_exactly_once(db: Session, auth_headers, fee_config):
    headers, user, wallet = auth_headers
    initial_balance = wallet.balance
    bet_amount = 10000
    
    round1 = create_round(db)
    bet = place_bet(db, user.id, round1.id, "RED", bet_amount)
    
    db.refresh(wallet)
    assert wallet.balance == initial_balance - bet_amount
    
    # Check transaction
    tx = db.query(WalletTransaction).filter(WalletTransaction.reference_id == str(bet.id)).all()
    assert len(tx) == 1
    assert tx[0].type == WalletTransactionType.GAME_ENTRY
    assert tx[0].amount == bet_amount

def test_insufficient_balance_rejects_bet(db: Session, auth_headers):
    headers, user, wallet = auth_headers
    round1 = create_round(db)
    
    with pytest.raises(ValueError, match="Insufficient balance"):
        place_bet(db, user.id, round1.id, "RED", wallet.balance + 100)

def test_concurrent_bets_prevent_negative_balance(db: Session, auth_headers):
    # This test might be tricky to write in pure python threads with sqlalchemy without careful setup
    # Given the requirements, we'll write an asyncio / threading test if needed, or rely on 
    # db row-level locks verified by sequential transactions
    headers, user, wallet = auth_headers
    wallet.balance = 500
    db.commit()
    
    round1 = create_round(db)
    
    import threading
    exceptions = []
    
    from tests.integration.conftest import TestingSessionLocal
    
    def place():
        with TestingSessionLocal() as session:
            try:
                place_bet(session, user.id, round1.id, "RED", 300)
            except Exception as e:
                exceptions.append(e)

    t1 = threading.Thread(target=place)
    t2 = threading.Thread(target=place)
    
    t1.start()
    t2.start()
    t1.join()
    t2.join()
    
    assert len(exceptions) == 1
    assert "Insufficient balance" in str(exceptions[0])

# ── ENTRY FEE TESTS ──────────────────────────────────────────────────

def test_entry_fee_calculation(db: Session, auth_headers, fee_config):
    headers, user, wallet = auth_headers
    round1 = create_round(db)
    
    bet = place_bet(db, user.id, round1.id, "RED", 10000) # 100 INR
    assert bet.amount == 10000
    assert bet.entry_fee_amount == 500 # 5% of 10000
    assert bet.stake_amount == 9500

    # Ensure transaction metadata contains correct values
    tx = db.query(WalletTransaction).filter(WalletTransaction.reference_id == str(bet.id)).first()
    assert tx.metadata_["entry_fee"] == 500
    assert tx.metadata_["stake"] == 9500

def test_fee_change_affects_new_bets_only(db: Session, auth_headers, fee_config):
    headers, user, wallet = auth_headers
    round1 = create_round(db)
    
    bet1 = place_bet(db, user.id, round1.id, "RED", 10000)
    assert bet1.entry_fee_amount == 500
    
    fee_config.game_entry_fee_percent = Decimal("10.00")
    db.commit()
    
    bet2 = place_bet(db, user.id, round1.id, "RED", 10000)
    assert bet2.entry_fee_amount == 1000

# ── WINNING / LOSING TESTS ──────────────────────────────────────────────

def test_winning_bet_payout(db: Session, auth_headers, fee_config):
    headers, user, wallet = auth_headers
    round1 = create_round(db)
    
    bet = place_bet(db, user.id, round1.id, "RED", 10000)
    initial_balance = wallet.balance
    
    # Mock secrets.randbelow to force RED
    import secrets
    original_rand = secrets.randbelow
    try:
        secrets.randbelow = lambda _: 2 # 2 is RED
        lock_round_for_calculation(db, round1.id)
        settled_round = settle_round(db, round1.id)
        
        db.refresh(bet)
        assert bet.status == GameBetStatus.WON
        # Stake: 9500. Multiplier for RED: 2x. Gross win: 19000
        assert bet.gross_win_amount == 19000
        # Winning fee: 10% of 19000 = 1900
        assert bet.winning_fee_amount == 1900
        # Net win: 17100
        assert bet.net_win_amount == 17100
        
        db.refresh(wallet)
        assert wallet.balance == initial_balance + 17100
    finally:
        secrets.randbelow = original_rand

def test_losing_bet(db: Session, auth_headers, fee_config):
    headers, user, wallet = auth_headers
    round1 = create_round(db)
    
    bet = place_bet(db, user.id, round1.id, "GREEN", 10000)
    initial_balance = wallet.balance
    
    import secrets
    original_rand = secrets.randbelow
    try:
        secrets.randbelow = lambda _: 2 # 2 is RED
        lock_round_for_calculation(db, round1.id)
        settle_round(db, round1.id)
        
        db.refresh(bet)
        assert bet.status == GameBetStatus.LOST
        assert bet.gross_win_amount == 0
        assert bet.net_win_amount == 0
        
        db.refresh(wallet)
        assert wallet.balance == initial_balance # no payout
    finally:
        secrets.randbelow = original_rand

# ── SECURITY TESTS ──────────────────────────────────────────────────────

def test_unauthenticated_users_cannot_place_bets(client):
    res = client.post("/api/v1/games/bet", json={"round_id": str(uuid4()), "prediction": "RED", "amount": 1000})
    assert res.status_code in [401, 403]

def test_normal_user_cannot_access_admin_endpoints(client, auth_headers):
    headers, user, wallet = auth_headers
    res = client.get("/api/v1/admin/games/rounds", headers=headers)
    assert res.status_code == 403

def test_admin_can_access_admin_endpoints(client, admin_headers):
    headers, admin = admin_headers
    res = client.get("/api/v1/admin/games/rounds", headers=headers)
    assert res.status_code == 200

# ── WEBSOCKET TESTS ─────────────────────────────────────────────────────

def test_websocket_connection(client):
    with client.websocket_connect("/api/v1/ws/games") as websocket:
        # Just ensure we can connect and it doesn't immediately close with an error
        # Sending a message shouldn't crash it, it should just be ignored
        websocket.send_text("Hello")
        # We don't receive anything immediately because broadcasts are triggered by the engine, 
        # which isn't running in this synchronous test context.
        pass

# ── FINANCIAL INVARIANTS ────────────────────────────────────────────────

def test_financial_invariants(db: Session, auth_headers, fee_config):
    headers, user, wallet = auth_headers
    round1 = create_round(db)
    
    bet1 = place_bet(db, user.id, round1.id, "RED", 10000)
    bet2 = place_bet(db, user.id, round1.id, "GREEN", 10000)
    
    import secrets
    original_rand = secrets.randbelow
    try:
        secrets.randbelow = lambda _: 2 # 2 is RED
        lock_round_for_calculation(db, round1.id)
        settle_round(db, round1.id)
        
        # Verify invariants for this user's transactions
        txs = db.query(WalletTransaction).filter(WalletTransaction.user_id == user.id).order_by(WalletTransaction.created_at).all()
        for tx in txs:
            if tx.type in (WalletTransactionType.GAME_ENTRY, WalletTransactionType.WITHDRAWAL):
                assert tx.balance_after == tx.balance_before - tx.amount
            elif tx.type in (WalletTransactionType.GAME_WIN, WalletTransactionType.DEPOSIT):
                assert tx.balance_after == tx.balance_before + tx.amount
    finally:
        secrets.randbelow = original_rand
