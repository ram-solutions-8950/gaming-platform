"""Guard against re-introducing the stale-lock class of bug.

``SELECT ... FOR UPDATE`` without ``populate_existing`` takes the row lock but
returns whatever copy of the entity is already in the session's identity map.
Read-modify-write then runs on a superseded value, which silently drops a
concurrent transaction's work: a wallet loses a credit, a deposit is credited
twice, a withdrawal is refunded twice.

This test fails if any new ``with_for_update()`` appears without that
protection, so the fix cannot quietly rot.
"""
from __future__ import annotations

import re
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parents[2] / "app"
LOCKING_HELPER = APP_ROOT / "utils" / "locking.py"

# The helpers in utils/locking.py are the implementation of the rule and are
# allowed to call with_for_update() directly.
EXEMPT = {LOCKING_HELPER}


def _python_files():
    return [p for p in APP_ROOT.rglob("*.py") if p not in EXEMPT]


def test_every_for_update_is_populate_existing():
    """Each with_for_update() must carry populate_existing on the same statement."""
    offenders = []

    for path in _python_files():
        lines = path.read_text().splitlines()
        for i, line in enumerate(lines):
            if "with_for_update" not in line:
                continue
            # Look at the whole statement, not just the one line: the option
            # may be chained on a following line.
            window = "\n".join(lines[max(0, i - 6) : i + 7])
            if "populate_existing" in window:
                continue
            offenders.append(f"{path.relative_to(APP_ROOT.parent)}:{i + 1}: {line.strip()}")

    assert not offenders, (
        "with_for_update() without populate_existing takes the lock but may "
        "return a stale cached entity, which silently loses concurrent "
        "updates. Use app.utils.locking.lock_one / lock_all instead:\n  "
        + "\n  ".join(offenders)
    )


def test_locking_helpers_set_populate_existing():
    """The helpers themselves must actually apply the option."""
    source = LOCKING_HELPER.read_text()
    assert source.count("populate_existing=True") >= 2, (
        "app/utils/locking.py must apply populate_existing=True in both "
        "lock_one and lock_all"
    )
    assert "with_for_update" in source


def test_no_direct_wallet_balance_mutation_outside_wallet_service():
    """All balance changes must go through the locked credit/debit helpers.

    A bare ``wallet.balance = ...`` or ``+=`` elsewhere bypasses the row lock,
    the ledger row and the duplicate-reference guard.
    """
    pattern = re.compile(r"\.balance\s*(=[^=]|\+=|-=)")
    allowed = {
        APP_ROOT / "services" / "wallet_service.py",
        APP_ROOT / "utils" / "locking.py",
    }
    offenders = []

    for path in _python_files():
        if path in allowed:
            continue
        for i, line in enumerate(path.read_text().splitlines()):
            stripped = line.strip()
            if stripped.startswith("#"):
                continue
            if pattern.search(stripped):
                offenders.append(
                    f"{path.relative_to(APP_ROOT.parent)}:{i + 1}: {stripped}"
                )

    assert not offenders, (
        "Wallet balances must only be changed via wallet_service.credit_wallet "
        "/ debit_wallet, which lock the row and write a ledger entry:\n  "
        + "\n  ".join(offenders)
    )
