"""
Regression tests for the reopened admin-portal QA bugs.

BUG-017 / BUG-026 / BUG-031 / BUG-041 — the admin search boxes returned a 500
because `cast`/`String` were never imported in the admin router, and a term
pasted out of a table cell still carried the trailing ellipsis.
BUG-014 / BUG-016 — Live Game Control counted bets from `game_bets` only, so
Aviator rounds were missing entirely and every row showed 0 bets / a 0 pool; the
bets drill-down crashed on `User.full_name`, which does not exist.
"""

import pytest
from uuid import uuid4
from datetime import datetime, timezone, timedelta

from sqlalchemy.orm import Session

from app.models.user import User, UserRole, UserStatus
from app.models.wallet import Wallet
from app.models.game import GameRound, GameRoundStatus, GamePrediction, GameBet, GameBetStatus
from app.models.game_catalog import Game, GameStatus
from app.models.aviator import (
    AviatorRound, AviatorRoundStatus, AviatorBet, AviatorBetStatus,
)
from app.security.jwt import create_access_token


@pytest.fixture
def admin_headers(client, db: Session):
    admin = User(
        id=uuid4(),
        name="Portal Admin",
        username=f"portaladmin_{str(uuid4())[:8]}",
        email=f"portaladmin_{str(uuid4())[:8]}@example.com",
        password_hash="fakehash",
        role=UserRole.ADMIN,
        status=UserStatus.ACTIVE,
    )
    db.add(admin)
    db.commit()
    return {"Authorization": f"Bearer {create_access_token(str(admin.id), admin.role.value)}"}, admin


@pytest.fixture
def player(db: Session):
    user = User(
        id=uuid4(),
        name="Searchable Player",
        username=f"searchable_{str(uuid4())[:8]}",
        email=f"searchable_{str(uuid4())[:8]}@example.com",
        password_hash="fakehash",
        role=UserRole.USER,
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    db.add(Wallet(id=uuid4(), user_id=user.id, balance=500000))
    db.commit()
    return user


@pytest.fixture
def colour_game(db: Session):
    game = db.query(Game).filter(Game.slug == "colour-prediction").first()
    if not game:
        game = Game(
            name="Colour Prediction",
            slug="colour-prediction",
            game_type="COLOUR_PREDICTION",
            description="Colour prediction game",
            status=GameStatus.ACTIVE,
            min_bet=1000,
            max_bet=100000,
        )
        db.add(game)
        db.commit()
        db.refresh(game)
    return game


@pytest.fixture
def aviator_game(db: Session):
    game = db.query(Game).filter(Game.slug == "aviator").first()
    if not game:
        game = Game(
            name="Aviator",
            slug="aviator",
            game_type="AVIATOR",
            description="Crash game",
            status=GameStatus.ACTIVE,
            min_bet=1000,
            max_bet=100000,
        )
        db.add(game)
        db.commit()
        db.refresh(game)
    return game


def _round_with_bets(db: Session, game: Game, user: User, amounts=(10000, 25000)) -> GameRound:
    now = datetime.now(timezone.utc)
    rnd = GameRound(
        id=uuid4(),
        game_id=game.id,
        status=GameRoundStatus.BETTING,
        started_at=now,
        betting_closes_at=now + timedelta(seconds=15),
    )
    db.add(rnd)
    for amount in amounts:
        db.add(GameBet(
            id=uuid4(),
            user_id=user.id,
            game_id=game.id,
            round_id=rnd.id,
            prediction=GamePrediction.RED,
            amount=amount,
            entry_fee_amount=0,
            stake_amount=amount,
            status=GameBetStatus.PENDING,
        ))
    db.commit()
    return rnd


def _aviator_round_with_bets(db: Session, user: User, amounts=(20000, 30000)) -> AviatorRound:
    rnd = AviatorRound(
        id=uuid4(),
        nonce=1,
        server_seed_hash="a" * 64,
        server_seed="b" * 32,
        crash_multiplier=2.45,
        status=AviatorRoundStatus.SETTLED,
        betting_started_at=datetime.now(timezone.utc),
        settled_at=datetime.now(timezone.utc),
    )
    db.add(rnd)
    for slot, amount in enumerate(amounts, start=1):
        db.add(AviatorBet(
            id=uuid4(),
            user_id=user.id,
            round_id=rnd.id,
            slot=slot,
            amount=amount,
            status=AviatorBetStatus.CASHED_OUT,
            cashout_multiplier=2.0,
            payout=amount * 2,
            cashed_out_at=datetime.now(timezone.utc),
        ))
    db.commit()
    return rnd


def _items(res):
    assert res.status_code == 200, res.text
    return res.json()["data"]["items"]


# ── admin search boxes ──────────────────────────────────────────────

@pytest.mark.parametrize("path", ["users", "transactions", "deposits", "withdrawals"])
def test_admin_search_does_not_error(client, admin_headers, path):
    headers, _ = admin_headers
    res = client.get(f"/api/v1/admin/{path}", params={"search": "anything"}, headers=headers)
    assert res.status_code == 200, res.text


def test_user_search_matches_name_email_and_id(client, admin_headers, player):
    headers, _ = admin_headers
    for term in (player.name, player.email, player.username, str(player.id)):
        found = _items(client.get("/api/v1/admin/users", params={"search": term}, headers=headers))
        assert str(player.id) in [u["id"] for u in found], f"search {term!r} missed the user"


def test_user_search_accepts_a_truncated_id_pasted_from_the_table(client, admin_headers, player):
    """The table shortens ids to `cf40682f...`; retyping that must still match."""
    headers, _ = admin_headers
    short = str(player.id)[:8]
    for term in (short, f"{short}...", f"{short}…", f'"{short}"'):
        found = _items(client.get("/api/v1/admin/users", params={"search": term}, headers=headers))
        assert str(player.id) in [u["id"] for u in found], f"search {term!r} missed the user"


def test_user_search_excludes_non_matching_rows(client, admin_headers, player):
    headers, _ = admin_headers
    found = _items(client.get(
        "/api/v1/admin/users", params={"search": f"nobody-{uuid4()}"}, headers=headers,
    ))
    assert found == []


def test_transactions_carry_the_owning_user_id(client, admin_headers, db, player):
    """The admin table lists and copies the User ID, so the payload must have one."""
    from app.models.wallet import Wallet
    from app.models.transaction import (
        WalletTransaction, WalletTransactionType, WalletTransactionStatus,
    )

    headers, _ = admin_headers
    wallet = db.query(Wallet).filter(Wallet.user_id == player.id).first()
    tx = WalletTransaction(
        id=uuid4(), user_id=player.id, wallet_id=wallet.id,
        type=WalletTransactionType.DEPOSIT, amount=10000,
        balance_before=0, balance_after=10000,
        status=WalletTransactionStatus.COMPLETED,
        reference_type="deposit", reference_id=str(uuid4()),
    )
    db.add(tx)
    db.commit()

    found = _items(client.get(
        "/api/v1/admin/transactions", params={"search": str(tx.id)}, headers=headers,
    ))
    assert len(found) == 1
    assert found[0]["user_id"] == str(player.id)
    assert found[0]["user_name"] == player.name

    # and that id, pasted back into the search box, finds the same row
    by_user = _items(client.get(
        "/api/v1/admin/transactions", params={"search": str(player.id)}, headers=headers,
    ))
    assert str(tx.id) in [t["id"] for t in by_user]


# ── live game control ───────────────────────────────────────────────

def test_rounds_report_actual_bet_count_and_pool(client, admin_headers, db, colour_game, player):
    headers, _ = admin_headers
    rnd = _round_with_bets(db, colour_game, player, amounts=(10000, 25000))

    found = _items(client.get(
        "/api/v1/admin/games/rounds", params={"search": str(rnd.id)}, headers=headers,
    ))
    assert len(found) == 1
    assert found[0]["total_bets"] == 2
    assert found[0]["total_amount"] == 35000


def test_aviator_rounds_appear_with_their_bets(client, admin_headers, db, aviator_game, player):
    """Aviator keeps its own tables — its rounds used to be missing entirely."""
    headers, _ = admin_headers
    rnd = _aviator_round_with_bets(db, player, amounts=(20000, 30000))

    found = _items(client.get(
        "/api/v1/admin/games/rounds", params={"search": str(rnd.id)[:8]}, headers=headers,
    ))
    assert len(found) == 1
    row = found[0]
    assert row["game_name"] == "Aviator"
    assert row["total_bets"] == 2
    assert row["total_amount"] == 50000
    assert row["status"] == "COMPLETED"           # SETTLED maps onto the shared filter
    assert row["result_data"] == {"multiplier": 2.45}


def test_bets_drilldown_resolves_player_names(client, admin_headers, db, colour_game, player):
    headers, _ = admin_headers
    rnd = _round_with_bets(db, colour_game, player, amounts=(10000,))

    found = _items(client.get(
        "/api/v1/admin/games/bets", params={"round_id": str(rnd.id)}, headers=headers,
    ))
    assert len(found) == 1
    assert found[0]["user_name"] == player.name
    assert found[0]["amount"] == 10000


def test_aviator_bets_drilldown(client, admin_headers, db, aviator_game, player):
    headers, _ = admin_headers
    rnd = _aviator_round_with_bets(db, player, amounts=(20000,))

    found = _items(client.get(
        "/api/v1/admin/games/bets", params={"round_id": str(rnd.id)}, headers=headers,
    ))
    assert len(found) == 1
    bet = found[0]
    assert bet["user_name"] == player.name
    assert bet["status"] == "WON"
    assert bet["net_win_amount"] == 40000
    assert bet["prediction"].startswith("Slot 1")


def test_bets_drilldown_rejects_a_malformed_round_id(client, admin_headers):
    headers, _ = admin_headers
    res = client.get("/api/v1/admin/games/bets", params={"round_id": "not-a-uuid"}, headers=headers)
    assert res.status_code == 422
