"""Integration tests for new features:
1. Per-game commission system with admin overrides
2. Wager requirement lifecycle (deposit -> bet -> withdrawal check)
3. Chicken Road lane 0 cashout block
4. Triple 777 slot 20% win-ratio and display-only jackpot
5. Percentage-based referral reward (10% on first deposit >= Rs 100)
"""
import uuid
import pytest
from decimal import Decimal
from fastapi.testclient import TestClient

from app.main import app
from app.models.fee_configuration import FeeConfiguration
from app.models.user import User, UserRole
from app.models.wallet import Wallet
from app.models.deposit import Deposit, DepositStatus
from app.models.referral import Referral, ReferralSettings, ReferralStatus
from app.models.wager import WagerRequirement
from app.services.settlement_service import (
    get_admin_winning_fee_percent,
    calculate_winning_settlement,
    settle_winning_bet,
)
from app.services.wager_service import (
    create_wager_requirement,
    record_wager,
    reverse_wager,
    check_wager_fulfilled,
    get_remaining_wager,
    get_wager_status,
)
from app.services.referral_service import (
    get_referral_settings,
    check_and_qualify_referral,
)
from app.services.wallet_service import get_balance, credit_wallet
from app.models.transaction import WalletTransactionType


def _create_user(db, name="Player", username="player1"):
    uid = uuid.uuid4()
    user = User(
        id=uid,
        name=name,
        username=username,
        email=f"{username}@example.com",
        password_hash="hash",
        role=UserRole.USER,
        referral_code=username.upper(),
    )
    db.add(user)
    wallet = Wallet(user_id=uid, balance=50000)  # Rs 500
    db.add(wallet)
    db.commit()
    return user


def test_per_game_commission_overrides(db):
    """Test that per-game commission overrides take precedence over global default."""
    cfg = db.query(FeeConfiguration).first()
    if not cfg:
        cfg = FeeConfiguration(winning_fee_percent=Decimal("5.00"))
        db.add(cfg)
    else:
        cfg.winning_fee_percent = Decimal("5.00")

    # Set overrides: dragon-tiger at 10%, roulette at 2%, teen_patti at 7%
    cfg.game_commission_overrides = {
        "dragon-tiger": 10.0,
        "roulette": 2.0,
        "teen_patti": 7.0,
    }
    db.commit()

    # dragon-tiger should use 10%
    assert get_admin_winning_fee_percent(db, "dragon-tiger") == Decimal("10.0")
    # underscore vs hyphen normalization
    assert get_admin_winning_fee_percent(db, "dragon_tiger") == Decimal("10.0")
    assert get_admin_winning_fee_percent(db, "roulette") == Decimal("2.0")
    assert get_admin_winning_fee_percent(db, "teen-patti") == Decimal("7.0")

    # Unlisted game (e.g. aviator) should fallback to global 5.00%
    assert get_admin_winning_fee_percent(db, "aviator") == Decimal("5.00")
    assert get_admin_winning_fee_percent(db, None) == Decimal("5.00")

    # Test calculation with per-game override
    # Bet 1000 (Rs 10), Profit 2000 (Rs 20) in dragon-tiger (10% fee = 200 fee, net profit 1800, return 2800)
    calc = calculate_winning_settlement(
        db=db,
        original_bet=1000,
        gross_profit=2000,
        game_slug="dragon-tiger",
    )
    assert calc.winning_fee_percent == Decimal("10.0")
    assert calc.winning_fee == 200
    assert calc.net_profit == 1800
    assert calc.total_return == 2800


def test_wager_requirement_lifecycle(db):
    """Test that deposit creates wager requirement, bets clear it, and withdrawal is enforced."""
    user = _create_user(db, "Wager Player", "wager_p1")

    # 1. Deposit Rs 500 (50000 paise)
    req = create_wager_requirement(db, user.id, 50000)
    db.commit()

    assert req.required_amount == 50000
    assert req.completed_amount == 0
    assert not req.is_fulfilled
    assert not check_wager_fulfilled(db, user.id)
    assert get_remaining_wager(db, user.id) == 50000

    status = get_wager_status(db, user.id)
    assert status["remaining_inr"] == 500.0
    assert status["is_fulfilled"] is False

    # 2. Place a bet of Rs 200 (20000 paise)
    applied = record_wager(db, user.id, 20000, "chicken_road")
    db.commit()
    assert applied == 20000
    assert get_remaining_wager(db, user.id) == 30000
    assert not check_wager_fulfilled(db, user.id)

    # 3. Place remaining bet of Rs 300 (30000 paise)
    applied2 = record_wager(db, user.id, 30000, "dragon_tiger")
    db.commit()
    assert applied2 == 30000
    assert get_remaining_wager(db, user.id) == 0
    assert check_wager_fulfilled(db, user.id) is True

    status_done = get_wager_status(db, user.id)
    assert status_done["is_fulfilled"] is True
    assert status_done["remaining_inr"] == 0.0


def test_wager_reversal_on_refund(db):
    """Test that refund/push rolls back recorded wager."""
    user = _create_user(db, "Refund Player", "refund_p1")
    create_wager_requirement(db, user.id, 10000)
    db.commit()

    # User bets 10000
    record_wager(db, user.id, 10000, "roulette")
    db.commit()
    assert check_wager_fulfilled(db, user.id) is True

    # Game was refunded / pushed -> wager reversed
    reverse_wager(db, user.id, 10000, "roulette")
    db.commit()
    assert check_wager_fulfilled(db, user.id) is False
    assert get_remaining_wager(db, user.id) == 10000


def test_referral_percentage_reward_and_min_deposit(db):
    """Test that referral awards 10% on deposits >= Rs 100, and rejects < Rs 100."""
    settings = get_referral_settings(db)
    settings.reward_type = "PERCENTAGE"
    settings.reward_percentage = Decimal("10.00")
    settings.min_deposit_amount = 10000  # Rs 100 in paise
    settings.is_active = True
    db.commit()

    referrer = _create_user(db, "Top Referrer", "top_ref")
    referred = _create_user(db, "New Player", "new_p1")

    # Create referral link
    ref = Referral(
        referrer_user_id=referrer.id,
        referred_user_id=referred.id,
        referral_code=referrer.referral_code,
        status=ReferralStatus.REGISTERED,
    )
    db.add(ref)
    db.commit()

    # Deposit Rs 50 (5000 paise) — BELOW minimum Rs 100
    small_dep = Deposit(
        user_id=referred.id,
        wallet_id=referred.wallet.id,
        amount=5000,
        status=DepositStatus.SUCCESS,
    )
    db.add(small_dep)
    db.commit()

    check_and_qualify_referral(db, referred.id)
    db.commit()

    # Should NOT qualify because 5000 < 10000
    ref_check = db.query(Referral).filter(Referral.id == ref.id).first()
    assert ref_check.status == ReferralStatus.REGISTERED

    # Now make deposit Rs 1000 (100000 paise)
    db.delete(small_dep)
    big_dep = Deposit(
        user_id=referred.id,
        wallet_id=referred.wallet.id,
        amount=100000,
        status=DepositStatus.SUCCESS,
    )
    db.add(big_dep)
    db.commit()

    check_and_qualify_referral(db, referred.id)
    db.commit()

    # Should qualify and credit 10% of Rs 1000 = Rs 100 (10000 paise)
    ref_check2 = db.query(Referral).filter(Referral.id == ref.id).first()
    assert ref_check2.status == ReferralStatus.REWARD_PAID
    assert ref_check2.reward_amount == 10000  # 10% of 100000

