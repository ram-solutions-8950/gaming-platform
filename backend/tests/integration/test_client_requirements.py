"""Client-requested behaviour, end to end.

Covers the four settings the client asked for:
  1. per-game commission so hedged bets cannot break even;
  2. Chicken Road bets are committed once placed;
  3. Refer & Win paying 10% of a qualifying first deposit;
  4. Triple 777 capped at a 20% win ratio with a display-only jackpot.
"""

import pytest
from decimal import Decimal
from uuid import uuid4
from sqlalchemy.orm import Session

from app.models.user import User, UserRole, UserStatus
from app.models.wallet import Wallet
from app.models.deposit import Deposit, DepositStatus
from app.models.referral import Referral, ReferralSettings, ReferralStatus
from app.models.fee_configuration import FeeConfiguration
from app.security.jwt import create_access_token
from app.services.auth_service import register_user
from app.services.referral_service import check_and_qualify_referral, get_referral_settings
from app.services.settlement_service import (
    get_admin_winning_fee_percent,
    calculate_winning_settlement,
)
from app.services.wallet_service import get_balance
import app.routers.triple_777 as t777


@pytest.fixture
def fee_config(db: Session):
    cfg = db.query(FeeConfiguration).first()
    if not cfg:
        cfg = FeeConfiguration()
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    original = (cfg.winning_fee_percent, cfg.game_commission_overrides)
    yield cfg
    cfg.winning_fee_percent, cfg.game_commission_overrides = original
    db.commit()


@pytest.fixture
def referral_settings(db: Session):
    settings = get_referral_settings(db)
    original = (
        settings.reward_amount,
        settings.is_active,
        settings.reward_type,
        settings.reward_percentage,
        settings.min_deposit_amount,
    )
    yield settings
    (
        settings.reward_amount,
        settings.is_active,
        settings.reward_type,
        settings.reward_percentage,
        settings.min_deposit_amount,
    ) = original
    db.commit()


def _make_user(db, prefix, balance=500_000):
    suffix = uuid4().hex[:8]
    user = User(
        id=uuid4(),
        name=prefix.title(),
        username=f"{prefix}_{suffix}",
        email=f"{prefix}_{suffix}@example.com",
        password_hash="fakehash",
        role=UserRole.USER,
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    wallet = Wallet(id=uuid4(), user_id=user.id, balance=balance)
    db.add(wallet)
    db.commit()
    token = create_access_token(str(user.id), user.role.value)
    return {"Authorization": f"Bearer {token}"}, user, wallet


# ═══ 1. Per-game commission ══════════════════════════════════════════════

def test_per_game_override_beats_the_global_rate(db, fee_config):
    fee_config.winning_fee_percent = Decimal("2.00")
    fee_config.game_commission_overrides = {"dragon-tiger": 8.5}
    db.commit()

    assert get_admin_winning_fee_percent(db, game_slug="dragon-tiger") == Decimal("8.5")
    # A game with no override falls back to the global rate.
    assert get_admin_winning_fee_percent(db, game_slug="aviator") == Decimal("2.00")
    assert get_admin_winning_fee_percent(db) == Decimal("2.00")


def test_zero_override_suppresses_a_nonzero_global_rate(db, fee_config):
    fee_config.winning_fee_percent = Decimal("5.00")
    fee_config.game_commission_overrides = {"ludo": 0}
    db.commit()

    assert get_admin_winning_fee_percent(db, game_slug="ludo") == Decimal("0")


def test_commission_makes_a_both_sides_dragon_tiger_hedge_lose(db, fee_config):
    """The client's report: betting both sides returned the full stake back."""
    fee_config.winning_fee_percent = Decimal("0.00")
    fee_config.game_commission_overrides = {"dragon-tiger": 5.0}
    db.commit()

    stake = 10_000  # Rs 100 on each side, Rs 200 staked in total
    # The winning side pays 1:1, the other side is lost outright.
    calc = calculate_winning_settlement(
        db, original_bet=stake, gross_profit=stake, game_slug="dragon-tiger"
    )

    assert calc.winning_fee == 500              # 5% of the Rs 100 profit
    assert calc.total_return == 19_500          # Rs 195 back on Rs 200 staked
    assert calc.total_return < stake * 2        # hedging is no longer break-even


def test_commission_makes_a_three_dozen_roulette_hedge_lose(db, fee_config):
    """Covering all three dozens (10+10+10) previously returned exactly 30."""
    fee_config.winning_fee_percent = Decimal("0.00")
    fee_config.game_commission_overrides = {"roulette": 5.0}
    db.commit()

    stake = 1_000          # Rs 10 on one dozen
    total_staked = stake * 3  # all three dozens covered
    # Dozens pay 2:1, so the winning dozen returns stake + 2x stake.
    calc = calculate_winning_settlement(
        db, original_bet=stake, gross_profit=stake * 2, game_slug="roulette"
    )

    assert calc.winning_fee == 100          # 5% of the Rs 20 profit
    assert calc.total_return == 2_900       # Rs 29 back on Rs 30 staked
    assert calc.total_return < total_staked  # covering the table now costs money


def test_uncommissioned_dozen_hedge_is_break_even(db, fee_config):
    """Documents the reported bug: with no commission the hedge is free."""
    fee_config.winning_fee_percent = Decimal("0.00")
    fee_config.game_commission_overrides = {}
    db.commit()

    stake = 1_000
    calc = calculate_winning_settlement(
        db, original_bet=stake, gross_profit=stake * 2, game_slug="roulette"
    )
    assert calc.total_return == stake * 3  # exactly what was staked


def test_admin_can_read_and_set_game_commissions(client, db):
    from app.security.jwt import create_access_token as make_token
    suffix = uuid4().hex[:6]
    admin = User(
        id=uuid4(), name="Fee Admin", username=f"feeadmin_{suffix}",
        email=f"feeadmin_{suffix}@example.com", password_hash="fakehash",
        role=UserRole.ADMIN, status=UserStatus.ACTIVE,
    )
    db.add(admin)
    db.commit()
    headers = {"Authorization": f"Bearer {make_token(str(admin.id), admin.role.value)}"}

    res = client.get("/api/v1/admin/fees/game-commissions", headers=headers)
    assert res.status_code == 200
    data = res.json()["data"]
    assert "global_winning_fee_percent" in data
    slugs = {g["slug"] for g in data["games"]}
    assert {"dragon-tiger", "roulette", "triple_777", "chicken_road"} <= slugs

    res = client.put(
        "/api/v1/admin/fees/game-commissions",
        headers=headers,
        json={"game_overrides": {"dragon-tiger": 7.5, "roulette": 3}},
    )
    assert res.status_code == 200
    assert res.json()["data"]["game_overrides"] == {"dragon-tiger": 7.5, "roulette": 3.0}

    # Unknown slugs and out-of-range percentages are rejected.
    assert client.put(
        "/api/v1/admin/fees/game-commissions",
        headers=headers, json={"game_overrides": {"not-a-game": 5}},
    ).status_code == 400
    assert client.put(
        "/api/v1/admin/fees/game-commissions",
        headers=headers, json={"game_overrides": {"roulette": 150}},
    ).status_code == 400
    assert client.put(
        "/api/v1/admin/fees/game-commissions",
        headers=headers, json={"game_overrides": {"roulette": "abc"}},
    ).status_code == 400

    # Clear the overrides again so other tests see a clean config.
    client.put(
        "/api/v1/admin/fees/game-commissions", headers=headers, json={"game_overrides": {}}
    )


# ═══ 2. Chicken Road: the bet is committed ═══════════════════════════════

def test_cannot_cash_out_before_crossing_a_lane(client, db):
    headers, user, wallet = _make_user(db, "chicken")

    res = client.post(
        "/api/v1/games/chicken-road/start",
        json={"bet_amount": 50.0, "difficulty": "EASY"},
        headers=headers,
    )
    assert res.status_code == 200
    round_id = res.json()["data"]["round_id"]

    balance_after_bet = get_balance(db, user.id).balance
    assert balance_after_bet == 500_000 - 5_000

    # Immediately bailing out must not refund the stake.
    res = client.post(
        "/api/v1/games/chicken-road/cashout",
        json={"round_id": round_id},
        headers=headers,
    )
    assert res.status_code == 400
    assert "cross at least one lane" in res.json()["error"]["message"].lower()

    db.expire_all()
    assert get_balance(db, user.id).balance == balance_after_bet


def test_cashout_after_one_lane_pays_that_lane_multiplier(client, db):
    headers, user, _ = _make_user(db, "chicken")

    res = client.post(
        "/api/v1/games/chicken-road/start",
        json={"bet_amount": 50.0, "difficulty": "MEDIUM"},
        headers=headers,
    )
    round_id = res.json()["data"]["round_id"]

    client.post(
        "/api/v1/games/chicken-road/cross-lane",
        json={"round_id": round_id, "lane_index": 1},
        headers=headers,
    )
    res = client.post(
        "/api/v1/games/chicken-road/cashout",
        json={"round_id": round_id, "lane_index": 1},
        headers=headers,
    )
    assert res.status_code == 200
    assert res.json()["data"]["multiplier"] == 1.03


def test_cannot_finish_without_crossing_every_lane(client, db):
    """start -> finish would otherwise pay the full final multiplier for free."""
    headers, user, _ = _make_user(db, "chicken")

    res = client.post(
        "/api/v1/games/chicken-road/start",
        json={"bet_amount": 50.0, "difficulty": "HARD"},  # final lane pays 10x
        headers=headers,
    )
    round_id = res.json()["data"]["round_id"]
    balance_after_bet = get_balance(db, user.id).balance

    res = client.post(
        "/api/v1/games/chicken-road/finish",
        json={"round_id": round_id},
        headers=headers,
    )
    assert res.status_code == 400
    assert "lanes crossed" in res.json()["error"]["message"].lower()

    db.expire_all()
    assert get_balance(db, user.id).balance == balance_after_bet


def test_partial_progress_still_cannot_finish(client, db):
    headers, user, _ = _make_user(db, "chicken")

    res = client.post(
        "/api/v1/games/chicken-road/start",
        json={"bet_amount": 50.0, "difficulty": "HARD"},
        headers=headers,
    )
    round_id = res.json()["data"]["round_id"]

    for lane in range(1, 6):  # halfway across a 10-lane road
        client.post(
            "/api/v1/games/chicken-road/cross-lane",
            json={"round_id": round_id, "lane_index": lane},
            headers=headers,
        )

    res = client.post(
        "/api/v1/games/chicken-road/finish",
        json={"round_id": round_id},
        headers=headers,
    )
    assert res.status_code == 400

    # Cashing out at the lane actually reached is still allowed.
    res = client.post(
        "/api/v1/games/chicken-road/cashout",
        json={"round_id": round_id, "lane_index": 5},
        headers=headers,
    )
    assert res.status_code == 200
    assert res.json()["data"]["multiplier"] == 1.90


def test_finishing_the_full_road_pays_the_final_multiplier(client, db):
    headers, user, _ = _make_user(db, "chicken")

    res = client.post(
        "/api/v1/games/chicken-road/start",
        json={"bet_amount": 50.0, "difficulty": "EASY"},
        headers=headers,
    )
    round_id = res.json()["data"]["round_id"]

    for lane in range(1, 11):
        client.post(
            "/api/v1/games/chicken-road/cross-lane",
            json={"round_id": round_id, "lane_index": lane},
            headers=headers,
        )

    res = client.post(
        "/api/v1/games/chicken-road/finish",
        json={"round_id": round_id},
        headers=headers,
    )
    assert res.status_code == 200
    assert res.json()["data"]["multiplier"] == 1.50


def test_chicken_road_stake_counts_towards_wager(client, db):
    from app.services.wager_service import create_wager_requirement, get_remaining_wager

    headers, user, _ = _make_user(db, "chicken")
    create_wager_requirement(db, user.id, 20_000)  # Rs 200
    db.commit()

    client.post(
        "/api/v1/games/chicken-road/start",
        json={"bet_amount": 100.0, "difficulty": "EASY"},
        headers=headers,
    )
    db.expire_all()
    assert get_remaining_wager(db, user.id) == 10_000  # Rs 100 still to play through


# ═══ 3. Refer & Win ══════════════════════════════════════════════════════

def _referred_pair(db, deposit_paise, status=DepositStatus.SUCCESS):
    suffix = uuid4().hex[:6]
    referrer = register_user(db, "Referrer", f"reftop_{suffix}", f"reftop_{suffix}@e.com", "password123")
    referred = register_user(db, "Referred", f"refsub_{suffix}", f"refsub_{suffix}@e.com", "password123")

    db.add(Referral(
        id=uuid4(),
        referrer_user_id=referrer.id,
        referred_user_id=referred.id,
        referral_code=referrer.referral_code or f"CODE{suffix.upper()}",
        status=ReferralStatus.REGISTERED,
    ))
    wallet = db.query(Wallet).filter(Wallet.user_id == referred.id).first()
    db.add(Deposit(
        id=uuid4(), user_id=referred.id, wallet_id=wallet.id,
        amount=deposit_paise, status=status, provider="test",
        external_reference=f"dep_{uuid4().hex}",
    ))
    db.commit()
    return referrer, referred


def test_referrer_earns_ten_percent_of_the_first_deposit(db, referral_settings):
    referral_settings.is_active = True
    referral_settings.reward_type = "PERCENTAGE"
    referral_settings.reward_percentage = Decimal("10.00")
    referral_settings.min_deposit_amount = 10_000  # Rs 100
    db.commit()

    referrer, referred = _referred_pair(db, 10_000)  # Rs 100 deposit
    before = get_balance(db, referrer.id).balance

    check_and_qualify_referral(db, referred.id)
    db.commit()

    # Rs 100 deposit -> Rs 10 bonus
    assert get_balance(db, referrer.id).balance - before == 1_000


def test_percentage_scales_with_a_larger_deposit(db, referral_settings):
    referral_settings.is_active = True
    referral_settings.reward_type = "PERCENTAGE"
    referral_settings.reward_percentage = Decimal("10.00")
    referral_settings.min_deposit_amount = 10_000
    db.commit()

    referrer, referred = _referred_pair(db, 500_000)  # Rs 5,000 deposit
    before = get_balance(db, referrer.id).balance

    check_and_qualify_referral(db, referred.id)
    db.commit()

    assert get_balance(db, referrer.id).balance - before == 50_000  # Rs 500


def test_deposit_below_the_minimum_does_not_qualify(db, referral_settings):
    referral_settings.is_active = True
    referral_settings.reward_type = "PERCENTAGE"
    referral_settings.reward_percentage = Decimal("10.00")
    referral_settings.min_deposit_amount = 10_000  # Rs 100
    db.commit()

    referrer, referred = _referred_pair(db, 5_000)  # Rs 50 — under the floor
    before = get_balance(db, referrer.id).balance

    check_and_qualify_referral(db, referred.id)
    db.commit()

    assert get_balance(db, referrer.id).balance == before
    referral = db.query(Referral).filter(Referral.referred_user_id == referred.id).first()
    assert referral.status == ReferralStatus.REGISTERED


def test_reward_is_paid_once_even_if_qualification_runs_again(db, referral_settings):
    referral_settings.is_active = True
    referral_settings.reward_type = "PERCENTAGE"
    referral_settings.reward_percentage = Decimal("10.00")
    referral_settings.min_deposit_amount = 10_000
    db.commit()

    referrer, referred = _referred_pair(db, 100_000)
    before = get_balance(db, referrer.id).balance

    check_and_qualify_referral(db, referred.id)
    db.commit()
    check_and_qualify_referral(db, referred.id)
    db.commit()

    assert get_balance(db, referrer.id).balance - before == 10_000  # Rs 100, once


def test_flat_mode_still_pays_the_fixed_amount(db, referral_settings):
    referral_settings.is_active = True
    referral_settings.reward_type = "FLAT"
    referral_settings.reward_amount = 7_500  # Rs 75
    referral_settings.min_deposit_amount = 10_000
    db.commit()

    referrer, referred = _referred_pair(db, 200_000)
    before = get_balance(db, referrer.id).balance

    check_and_qualify_referral(db, referred.id)
    db.commit()

    assert get_balance(db, referrer.id).balance - before == 7_500


def test_referral_stats_expose_the_active_terms(client, db, referral_settings):
    referral_settings.is_active = True
    referral_settings.reward_type = "PERCENTAGE"
    referral_settings.reward_percentage = Decimal("10.00")
    referral_settings.min_deposit_amount = 10_000
    db.commit()

    headers, user, _ = _make_user(db, "refstats")
    res = client.get("/api/v1/referrals/stats", headers=headers)
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["reward_type"] == "PERCENTAGE"
    assert data["reward_percentage"] == 10.0
    assert data["min_deposit"] == 100.0
    assert data["is_active"] is True


# ═══ 4. Triple 777 ═══════════════════════════════════════════════════════

def test_losing_reels_never_contain_a_pair():
    for _ in range(3000):
        reels = t777._build_reels(False)
        assert len(set(reels)) == 3


def test_winning_reels_always_pay():
    for _ in range(3000):
        reels = t777._build_reels(True)
        assert len(set(reels)) < 3


def test_win_ratio_converges_on_twenty_percent():
    stats = {"spins": 0, "wins": 0}
    for _ in range(20_000):
        won = t777._should_win(stats)
        stats["spins"] += 1
        if won:
            stats["wins"] += 1

    ratio = stats["wins"] / stats["spins"]
    assert 0.19 <= ratio <= 0.21


def test_a_player_on_a_streak_is_pulled_back():
    # Already won far more than the target allows -> the next spin cannot win.
    assert t777._should_win({"spins": 10, "wins": 5}) is False
    assert t777._should_win({"spins": 100, "wins": 40}) is False


def test_a_player_behind_the_pace_is_allowed_to_win():
    # Well below target: the next spin should essentially always be a win.
    allowed = sum(1 for _ in range(200) if t777._should_win({"spins": 100, "wins": 5}))
    assert allowed == 200


def test_wins_are_not_on_a_fixed_cadence():
    """Guards against the ratio cap producing a predictable win position."""
    positions = set()
    for _ in range(60):
        stats = {"spins": 0, "wins": 0}
        for spin in range(10):
            won = t777._should_win(stats)
            stats["spins"] += 1
            if won:
                stats["wins"] += 1
                positions.add(spin)
    assert len(positions) >= 8  # wins land across the window, not on one slot


def test_jackpot_is_display_only(client, db):
    """Triple sevens pay the paytable multiplier; the pool is never awarded."""
    headers, user, _ = _make_user(db, "slots", balance=1_000_000)

    res = client.get("/api/v1/games/triple-777/config")
    assert res.json()["data"]["target_win_ratio"] == 0.20
    assert res.json()["data"]["jackpot_display_only"] is True

    jackpot_before = client.get("/api/v1/games/triple-777/jackpot").json()["data"]["amount"]

    for _ in range(40):
        res = client.post("/api/v1/games/triple-777/spin", json={"stake": 10}, headers=headers)
        if res.status_code != 200:
            break
        data = res.json()["data"]
        assert data["jackpot_won"] == 0.0
        assert data["tier"] != "jackpot"
        if data["reels"] == ["7", "7", "7"]:
            assert data["payout"] <= 10 * 100  # paytable only, not the pool

    # The pool only ever grows; it is never paid out and reset.
    jackpot_after = client.get("/api/v1/games/triple-777/jackpot").json()["data"]["amount"]
    assert jackpot_after >= jackpot_before


def test_live_spins_respect_the_win_ratio(client, db):
    headers, user, _ = _make_user(db, "slots", balance=5_000_000)
    t777.USER_SPIN_STATS.pop(user.id, None)

    wins = 0
    spins = 0
    for _ in range(100):
        res = client.post("/api/v1/games/triple-777/spin", json={"stake": 10}, headers=headers)
        assert res.status_code == 200
        spins += 1
        if res.json()["data"]["won"]:
            wins += 1

    assert spins == 100
    assert wins <= 30  # comfortably bounded around the 20% target
