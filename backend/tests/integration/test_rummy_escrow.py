"""
Real-money Rummy holds each player's maximum loss for a deal when it starts and
settles out of those holds, so a deal can always be paid out.
"""
import asyncio
import uuid

import pytest

from app.models.rummy import RummyTable, RummyTableMode
from app.models.user import User, UserRole, UserStatus
from app.models.wallet import Wallet
from app.services.rummy.deals_rummy import DealsRummyGame, GameConfig, Phase
from app.services.rummy.game_manager import game_manager
from app.services.wallet_service import get_balance
import app.websocket.rummy_ws as rws

ENTRY_FEE = 800  # 80-point cap at 10 paise a point


@pytest.fixture
def real_deal(client, db):
    users = []
    for _ in range(2):
        u = User(id=uuid.uuid4(), name="Holder", username=f"hold_{uuid.uuid4().hex[:8]}",
                 email=f"hold_{uuid.uuid4().hex[:8]}@example.com", password_hash="x",
                 role=UserRole.USER, status=UserStatus.ACTIVE)
        db.add(u)
        db.add(Wallet(id=uuid.uuid4(), user_id=u.id, balance=5000))
        users.append(u)
    table = RummyTable(mode=RummyTableMode.REAL_MONEY, max_players=2, num_deals=1, entry_fee_paise=ENTRY_FEE)
    db.add(table)
    db.commit()
    table_id = str(table.id)
    game = game_manager.get_or_create(table_id, GameConfig(max_players=2, num_deals=1))
    for u in users:
        game.add_player(str(u.id), u.username)
    yield table_id, game, users
    game_manager.remove(table_id)
    rws._deal_holds.pop(f"{table_id}:1", None)


def _balance(db, user):
    db.expire_all()
    return get_balance(db, user.id).balance


def test_deal_start_holds_the_maximum_loss(db, real_deal):
    table_id, game, users = real_deal
    assert rws._hold_deal_stakes(table_id, game) == []
    game.start_deal()
    assert all(_balance(db, u) == 5000 - ENTRY_FEE for u in users)


def test_loser_pays_only_their_points_even_after_emptying_the_wallet(db, real_deal):
    table_id, game, users = real_deal
    rws._hold_deal_stakes(table_id, game)
    game.start_deal()
    dropper = game.current_player().id
    loser = next(u for u in users if str(u.id) == dropper)
    winner = next(u for u in users if str(u.id) != dropper)

    get_balance(db, loser.id).balance = 0  # spent everything else mid-deal
    db.commit()

    game.drop(dropper)  # first drop: 20 points = 200 paise
    assert game.winner_id == str(winner.id)
    rws._settle_real_money(table_id, game)

    assert _balance(db, loser) == ENTRY_FEE - 200  # the unused part of the hold comes back
    assert _balance(db, winner) == 5000 + 200  # hold back, plus the loser's 200 (fee is 0% in tests)


def test_player_who_cannot_cover_the_hold_is_not_dealt_in(db, real_deal):
    table_id, game, users = real_deal
    get_balance(db, users[1].id).balance = ENTRY_FEE - 1
    db.commit()
    assert rws._hold_deal_stakes(table_id, game) == [str(users[1].id)]
    # nothing was held from anyone
    assert _balance(db, users[0]) == 5000


def test_shutdown_refunds_the_holds_of_a_deal_in_play(db, real_deal):
    table_id, game, users = real_deal
    rws._hold_deal_stakes(table_id, game)
    game.start_deal()
    rws.refund_live_deals()
    assert all(_balance(db, u) == 5000 for u in users)
