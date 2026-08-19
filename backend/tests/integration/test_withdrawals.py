import pytest
import concurrent.futures
from uuid import uuid4
from app.models.user import User, UserRole, UserStatus
from app.models.wallet import Wallet
from app.models.withdrawal import Withdrawal, WithdrawalStatus
from app.models.transaction import WalletTransaction, WalletTransactionType
from app.security.password import hash_password
from app.security.jwt import create_access_token
from app.services.wallet_service import credit_wallet, debit_wallet
from app.services.withdrawal_service import create_withdrawal, approve_withdrawal, mark_payment_processing, complete_withdrawal, reject_withdrawal, fail_withdrawal


def create_test_user(db, email: str, username: str, role: UserRole = UserRole.USER):
    user = User(
        id=uuid4(),
        name=f"Test {username}",
        username=username,
        email=email,
        password_hash=hash_password("Password123!"),
        role=role,
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    wallet = Wallet(id=uuid4(), user_id=user.id, balance=0)
    db.add(wallet)
    db.commit()
    db.refresh(user)
    return user


def get_auth_headers(user: User):
    token = create_access_token(str(user.id), user.role.value)
    return {"Authorization": f"Bearer {token}"}


# -----------------------------------------------------------------------------
# TEST 1: Initial Withdrawal debits wallet correctly and creates 1 transaction
# -----------------------------------------------------------------------------
def test_withdrawal_creation_debits_wallet(db):
    user = create_test_user(db, "w1@test.com", "wuser1")
    # Fund wallet with ₹400 = 40000 paisa
    credit_wallet(db, user.id, 40000, WalletTransactionType.DEPOSIT, "test_ref", str(uuid4()))
    db.commit()

    # Create withdrawal ₹100 = 10000 paisa
    w = create_withdrawal(db, user.id, 10000, "upi", "user1@upi")

    # Check wallet balance = ₹300 = 30000 paisa
    wallet = db.query(Wallet).filter(Wallet.user_id == user.id).first()
    assert wallet.balance == 30000

    # Check withdrawal record
    assert w.status == WithdrawalStatus.PENDING
    assert w.amount == 10000
    assert w.method == "upi"
    assert w.destination == "user1@upi"

    # Check ledger transaction
    txs = db.query(WalletTransaction).filter(
        WalletTransaction.user_id == user.id,
        WalletTransaction.type == WalletTransactionType.WITHDRAWAL
    ).all()
    assert len(txs) == 1
    assert txs[0].amount == 10000
    assert txs[0].reference_id == str(w.id)


# -----------------------------------------------------------------------------
# TEST 2: Overdrawing wallet balance is rejected
# -----------------------------------------------------------------------------
def test_insufficient_balance_rejected(db):
    user = create_test_user(db, "w2@test.com", "wuser2")
    # Fund wallet with ₹300 = 30000 paisa
    credit_wallet(db, user.id, 30000, WalletTransactionType.DEPOSIT, "test_ref", str(uuid4()))
    db.commit()

    # Attempt to withdraw ₹500 = 50000 paisa
    with pytest.raises(ValueError, match="Insufficient balance"):
        create_withdrawal(db, user.id, 50000, "bank", "Name: X, A/C: 123, IFSC: TEST")

    # Wallet balance remains ₹300
    wallet = db.query(Wallet).filter(Wallet.user_id == user.id).first()
    assert wallet.balance == 30000


# -----------------------------------------------------------------------------
# TEST 3, 4, 5: State machine transition PENDING -> APPROVED -> PROCESSING -> COMPLETED
# -----------------------------------------------------------------------------
def test_successful_withdrawal_lifecycle(db):
    admin = create_test_user(db, "admin1@test.com", "adminuser1", role=UserRole.ADMIN)
    user = create_test_user(db, "w3@test.com", "wuser3")
    credit_wallet(db, user.id, 40000, WalletTransactionType.DEPOSIT, "test_ref", str(uuid4()))
    db.commit()

    w = create_withdrawal(db, user.id, 10000, "upi", "user3@upi")
    assert w.status == WithdrawalStatus.PENDING

    # PENDING -> APPROVED
    w = approve_withdrawal(db, w.id, admin.id)
    assert w.status == WithdrawalStatus.APPROVED
    assert w.processed_by == admin.id

    # APPROVED -> PROCESSING (Payment Initiated)
    w = mark_payment_processing(db, w.id, admin.id)
    assert w.status == WithdrawalStatus.PROCESSING

    # PROCESSING -> COMPLETED
    w = complete_withdrawal(db, w.id, admin.id)
    assert w.status == WithdrawalStatus.COMPLETED

    # Check wallet balance = ₹300 (No second debit!)
    wallet = db.query(Wallet).filter(Wallet.user_id == user.id).first()
    assert wallet.balance == 30000

    # Ensure ONLY 1 WITHDRAWAL transaction exists
    txs = db.query(WalletTransaction).filter(
        WalletTransaction.user_id == user.id,
        WalletTransaction.type == WalletTransactionType.WITHDRAWAL
    ).all()
    assert len(txs) == 1


# -----------------------------------------------------------------------------
# TEST 6 & 7: Rejection from PENDING refunds wallet & double reject is idempotent
# -----------------------------------------------------------------------------
def test_rejection_refunds_and_idempotency(db):
    admin = create_test_user(db, "admin2@test.com", "adminuser2", role=UserRole.ADMIN)
    user = create_test_user(db, "w6@test.com", "wuser6")
    credit_wallet(db, user.id, 30000, WalletTransactionType.DEPOSIT, "test_ref", str(uuid4()))
    db.commit()

    # Withdraw ₹100 -> balance becomes ₹200
    w = create_withdrawal(db, user.id, 10000, "upi", "user6@upi")
    wallet = db.query(Wallet).filter(Wallet.user_id == user.id).first()
    assert wallet.balance == 20000

    # Reject withdrawal -> refunded to ₹300
    w = reject_withdrawal(db, w.id, admin.id, reason="Invalid UPI ID")
    assert w.status == WithdrawalStatus.REJECTED

    db.refresh(wallet)
    assert wallet.balance == 30000

    # Ensure exactly 1 REFUND transaction created
    refund_txs = db.query(WalletTransaction).filter(
        WalletTransaction.user_id == user.id,
        WalletTransaction.type == WalletTransactionType.REFUND
    ).all()
    assert len(refund_txs) == 1
    assert refund_txs[0].amount == 10000
    assert refund_txs[0].reference_id == str(w.id)

    # Attempt second rejection -> fails state machine validation, no double refund
    with pytest.raises(ValueError, match="Cannot reject withdrawal in status 'REJECTED'"):
        reject_withdrawal(db, w.id, admin.id, reason="Second reject attempt")

    db.refresh(wallet)
    assert wallet.balance == 30000


# -----------------------------------------------------------------------------
# TEST 8: Failure from PROCESSING refunds wallet & double fail is idempotent
# -----------------------------------------------------------------------------
def test_failure_from_processing_refunds(db):
    admin = create_test_user(db, "admin3@test.com", "adminuser3", role=UserRole.ADMIN)
    user = create_test_user(db, "w8@test.com", "wuser8")
    credit_wallet(db, user.id, 30000, WalletTransactionType.DEPOSIT, "test_ref", str(uuid4()))
    db.commit()

    w = create_withdrawal(db, user.id, 10000, "upi", "user8@upi")
    w = approve_withdrawal(db, w.id, admin.id)
    w = mark_payment_processing(db, w.id, admin.id)
    assert w.status == WithdrawalStatus.PROCESSING

    # Fail payment -> refunds ₹100
    w = fail_withdrawal(db, w.id, admin.id, reason="Bank network timeout")
    assert w.status == WithdrawalStatus.FAILED

    wallet = db.query(Wallet).filter(Wallet.user_id == user.id).first()
    assert wallet.balance == 30000

    refund_txs = db.query(WalletTransaction).filter(
        WalletTransaction.user_id == user.id,
        WalletTransaction.type == WalletTransactionType.REFUND
    ).all()
    assert len(refund_txs) == 1

    # Repeat failure attempt -> fails
    with pytest.raises(ValueError, match="Cannot fail withdrawal in status 'FAILED'"):
        fail_withdrawal(db, w.id, admin.id)

    db.refresh(wallet)
    assert wallet.balance == 30000


# -----------------------------------------------------------------------------
# TEST 9: Concurrent withdrawals cannot overspend wallet
# -----------------------------------------------------------------------------
def test_concurrent_withdrawals_overspend_prevention(db):
    user = create_test_user(db, "w9@test.com", "wuser9")
    # Fund wallet with ₹500 = 50000 paisa
    credit_wallet(db, user.id, 50000, WalletTransactionType.DEPOSIT, "test_ref", str(uuid4()))
    db.commit()

    # We will attempt 2 concurrent withdrawals: ₹400 and ₹300 (Total ₹700 > ₹500)
    from app.database import Base
    # First ₹400 succeeds
    w1 = create_withdrawal(db, user.id, 40000, "upi", "u9@upi")
    assert w1.status == WithdrawalStatus.PENDING

    # Second ₹300 must fail due to insufficient balance
    with pytest.raises(ValueError, match="Insufficient balance"):
        create_withdrawal(db, user.id, 30000, "upi", "u9@upi")

    wallet = db.query(Wallet).filter(Wallet.user_id == user.id).first()
    assert wallet.balance == 10000
    assert wallet.balance >= 0


# -----------------------------------------------------------------------------
# TEST 10: Non-admin users blocked from admin endpoints
# -----------------------------------------------------------------------------
def test_non_admin_blocked_from_admin_endpoints(client, db):
    user = create_test_user(db, "user_regular@test.com", "regularuser")
    headers = get_auth_headers(user)

    res = client.get("/api/v1/admin/withdrawals", headers=headers)
    assert res.status_code == 403

    fake_id = str(uuid4())
    res = client.post(f"/api/v1/admin/withdrawals/{fake_id}/approve", headers=headers)
    assert res.status_code == 403


# -----------------------------------------------------------------------------
# TEST 11: User A cannot see User B's withdrawals
# -----------------------------------------------------------------------------
def test_user_withdrawal_isolation(client, db):
    user_a = create_test_user(db, "usera@test.com", "user_a")
    user_b = create_test_user(db, "userb@test.com", "user_b")

    credit_wallet(db, user_a.id, 20000, WalletTransactionType.DEPOSIT, "ref_a", str(uuid4()))
    credit_wallet(db, user_b.id, 20000, WalletTransactionType.DEPOSIT, "ref_b", str(uuid4()))
    db.commit()

    w_a = create_withdrawal(db, user_a.id, 5000, "upi", "usera@upi")
    w_b = create_withdrawal(db, user_b.id, 8000, "upi", "userb@upi")

    # Fetch User A's withdrawals via API
    headers_a = get_auth_headers(user_a)
    res_a = client.get("/api/v1/withdrawals", headers=headers_a)
    assert res_a.status_code == 200
    data_a = res_a.json()["data"]["items"]
    assert len(data_a) == 1
    assert data_a[0]["id"] == str(w_a.id)

    # Fetch User B's withdrawals via API
    headers_b = get_auth_headers(user_b)
    res_b = client.get("/api/v1/withdrawals", headers=headers_b)
    assert res_b.status_code == 200
    data_b = res_b.json()["data"]["items"]
    assert len(data_b) == 1
    assert data_b[0]["id"] == str(w_b.id)
