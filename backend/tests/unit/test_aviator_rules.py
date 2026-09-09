"""
Unit tests for Aviator provably fair math, crash distribution, and balanced flight timing (BUG-028).
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
    raw = (e / (e - h)) * (1 - HOUSE_EDGE)
    calc = max(1.0, math.floor(raw * 100) / 100)

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
    BUG-028: Flight timing must give players engaging duration.
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
    Over 5,000 rounds, distribution should reflect 3% house edge (97% RTP):
    - Median around 1.8x - 2.1x
    - Instant crashes (1.00x) around ~2-5%
    """
    seed = "distribution_test_seed_fairness"
    crashes = [compute_crash_point(seed, n) for n in range(1, 5001)]
    instant_crashes = sum(1 for c in crashes if c == 1.00)
    instant_pct = instant_crashes / 5000.0

    assert instant_pct < 0.06, f"Too many instant crashes: {instant_pct:.2%}"

    sorted_crashes = sorted(crashes)
    median = sorted_crashes[2500]
    assert 1.70 <= median <= 2.20, f"Median crash {median} outside expected range"
