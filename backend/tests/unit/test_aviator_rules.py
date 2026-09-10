"""
Unit tests for Aviator provably fair math, crash distribution, and balanced flight timing.
"""
import hashlib
import hmac
import math
import pytest
from app.services.aviator.engine import (
    compute_crash_point,
    generate_server_seed,
    hash_server_seed,
    time_for_multiplier,
    multiplier_at_time,
    GROWTH_RATE,
    HOUSE_EDGE,
)
from app.services.aviator.models import AVIATOR_GROWTH_RATE


def test_growth_rates_aligned():
    """Verify backend engine and models have consistent growth rate."""
    assert GROWTH_RATE == 0.09
    assert AVIATOR_GROWTH_RATE == 0.09


def test_provably_fair_determinism():
    """Same seed and nonce must always produce identical crash points."""
    seed = "fixed_test_seed_12345"
    nonce = 42
    c1 = compute_crash_point(seed, nonce)
    c2 = compute_crash_point(seed, nonce)
    assert c1 == c2
    assert c1 >= 1.0


def test_provably_fair_independent_calculation():
    """Independent HMAC-SHA256 calculation matches compute_crash_point output."""
    seed = "independent_verification_seed_777"
    nonce = 101
    expected = compute_crash_point(seed, nonce)

    # Independent computation
    h_bytes = hmac.new(
        seed.encode(), str(nonce).encode(), hashlib.sha256
    ).hexdigest()
    h = int(h_bytes[:13], 16)
    e = 2 ** 52
    if h == e:
        calc = 1.00
    elif (h % 17) == 0:
        calc = round(1.00 + ((h % 16) / 100.0), 2)
    else:
        u = h / e
        raw = (1.0 / (1.0 - u)) * (1.0 - HOUSE_EDGE)
        if raw <= 1.00:
            calc = 1.00
        elif raw <= 2.00:
            calc = raw
        else:
            calc = 2.00 + math.pow(raw - 2.00, 0.58)
        calc = max(1.00, min(50.00, math.floor(calc * 100) / 100))

    assert expected == calc


def test_seed_hash_verification():
    """Server seed commitment must match SHA-256 hash."""
    seed = generate_server_seed()
    commit_hash = hash_server_seed(seed)
    assert commit_hash == hashlib.sha256(seed.encode()).hexdigest()


def test_crash_point_always_gte_one():
    """Crash point is bounded at 1.00 minimum."""
    seed = "test_bounds_seed"
    for nonce in range(1, 200):
        cp = compute_crash_point(seed, nonce)
        assert cp >= 1.0


def test_crash_timing_balanced_not_crashing_under_5_seconds_at_2x():
    """
    Flight timing must provide players an engaging duration.
    Reaching 2.0x multiplier should take ~7.7 seconds (well above 5 seconds).
    """
    t_2x = time_for_multiplier(2.0)
    assert t_2x > 7.0, f"Flight reached 2x too fast: {t_2x:.2f}s"
    assert t_2x < 8.5

    # 1.5x should take > 4s
    t_1_5x = time_for_multiplier(1.5)
    assert t_1_5x > 4.0

    # 3.0x should take > 11s
    t_3x = time_for_multiplier(3.0)
    assert t_3x > 11.0


def test_multiplier_roundtrip():
    """Multiplier at time and time for multiplier are exact mathematical inverses."""
    for target in [1.2, 1.5, 2.0, 3.5, 5.0, 10.0, 50.0]:
        t = time_for_multiplier(target)
        m = multiplier_at_time(t)
        assert abs(m - target) < 0.02, f"Roundtrip mismatch for {target}: got {m}"


def test_crash_distribution_healthy_rtp():
    """
    Over 10,000 rounds, distribution should reflect balanced casino math:
    - > 52% of rounds crash before 2.0x (curbing excessive winnings)
    - <= 3.5% of rounds reach >= 10.0x (jackpots are rare and exciting)
    - Mean multiplier is tightly controlled (< 4.0x, down from 15.5x)
    - Median is balanced around 1.6x - 2.0x
    """
    seed = "distribution_test_seed_fairness"
    crashes = [compute_crash_point(seed, n) for n in range(1, 10001)]
    under_2x = sum(1 for c in crashes if c < 2.00) / len(crashes)
    over_10x = sum(1 for c in crashes if c >= 10.00) / len(crashes)
    mean = sum(crashes) / len(crashes)
    sorted_crashes = sorted(crashes)
    median = sorted_crashes[len(crashes) // 2]

    assert under_2x > 0.52, f"Expected >52% sub-2x crashes, got {under_2x:.1%}"
    assert over_10x <= 0.035, f"Expected <=3.5% >=10x crashes, got {over_10x:.1%}"
    assert mean < 4.0, f"Expected mean < 4.0x, got {mean:.2f}x"
    assert 1.60 <= median <= 2.00, f"Median crash {median} outside expected range"


def test_aviator_engine_anti_streak():
    """
    Verify AviatorEngine prevents consecutive high multipliers (>= 4.0x)
    and clusters of mega multipliers (>= 10.0x).
    """
    from unittest.mock import MagicMock
    from app.services.aviator.engine import AviatorEngine

    engine = AviatorEngine()
    db = MagicMock()
    db.query.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = []

    crashes = []
    for _ in range(200):
        rnd = engine.create_round(db)
        crashes.append(rnd.crash_point)
        engine.start_flight(db)
        engine.crash_round(db)

    # 1. No consecutive >= 4.0x
    for i in range(len(crashes) - 1):
        assert not (crashes[i] >= 4.0 and crashes[i + 1] >= 4.0), (
            f"Found consecutive high rounds: {crashes[i]}x and {crashes[i+1]}x"
        )

    # 2. No more than 1 >= 10.0x in any 5-round window
    for i in range(len(crashes) - 5):
        window = crashes[i : i + 5]
        assert sum(1 for c in window if c >= 10.0) <= 1, (
            f"Found clustering of >=10x in window: {window}"
        )
