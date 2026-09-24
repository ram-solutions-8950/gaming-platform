"""
Teen Patti real-money stakes leave the wallet when they go into the pot, so a
hand can always be paid out, whatever a player does with their balance meanwhile.
"""
import uuid

import pytest

from app.models.teen_patti import TeenPattiTable, TeenPattiTableMode
from app.models.user import User, UserRole, UserStatus
from app.models.wallet import Wallet
from app.services.teen_patti.cards import Card
from app.services.teen_patti.engine import Phase, PlayerStatus, TeenPattiHand
from app.services.teen_patti.manager import teen_patti_manager
from app.services.wallet_service import get_balance
import app.websocket.teen_patti_ws as tpws


def _cards(*specs):
    ranks = {"J": 11, "Q": 12, "K": 13, "A": 14}
    return [Card(ranks.get(s[:-1]) or int(s[:-1]), s[-1]) for s in specs]


@pytest.fixture
def real_table(client, db):
    """A real-money table with two funded players and a hand dealt (boots in)."""
    users = []
    for _ in range(2):
        u = User(id=uuid.uuid4(), name="Escrow", username=f"esc_{uuid.uuid4().hex[:8]}",
                 email=f"esc_{uuid.uuid4().hex[:8]}@example.com", password_hash="x",
                 role=UserRole.USER, status=UserStatus.ACTIVE)
        db.add(u)
        db.add(Wallet(id=uuid.uuid4(), user_id=u.id, balance=50000))
        users.append(u)
    table = TeenPattiTable(mode=TeenPattiTableMode.REAL, max_players=2, boot_amount=1000)
    db.add(table)
    db.commit()
    table_id = str(table.id)

    cfg, _ = tpws._load_config(table_id)
    hand = TeenPattiHand(cfg)
    for u in users:
        hand.add_seat(str(u.id), u.username)
    teen_patti_manager._games[table_id] = hand
    hand.start_hand(client_seed="escrow", nonce=1)
    tpws._collect_stakes(table_id, hand)
    yield table_id, hand, users
    teen_patti_manager.remove(table_id)
    tpws._collected.pop(tpws._hand_key(table_id), None)


def _balance(db, user):
    db.expire_all()
    return get_balance(db, user.id).balance


def _turn_user(hand):
    return hand.seats[hand.current_turn].id


def test_boot_and_bets_leave_the_wallet_when_they_are_placed(db, real_table):
    table_id, hand, users = real_table
    assert all(_balance(db, u) == 49000 for u in users)  # boot collected on the deal

    better = _turn_user(hand)
    hand.bet(better)  # blind chaal of 1000
    tpws._collect_stakes(table_id, hand)
    user = next(u for u in users if str(u.id) == better)
    assert _balance(db, user) == 48000


def test_emptying_the_wallet_mid_hand_cannot_dodge_a_loss(db, real_table):
    table_id, hand, users = real_table
    first = _turn_user(hand)
    hand.bet(first)
    tpws._collect_stakes(table_id, hand)
    second = _turn_user(hand)
    loser_id, winner_id = first, second
    hand.seats[hand._seat_index(loser_id)].cards = _cards("2C", "5D", "9H")
    hand.seats[hand._seat_index(winner_id)].cards = _cards("AH", "AD", "AS")
    loser = next(u for u in users if str(u.id) == loser_id)
    winner = next(u for u in users if str(u.id) == winner_id)

    # The loser spends everything left elsewhere before the hand is decided
    get_balance(db, loser.id).balance = 0
    db.commit()

    hand.seats[hand._seat_index(second)].seen = True
    hand.show(second)  # seen show: 2x the 1000 stake
    tpws._collect_stakes(table_id, hand)
    tpws._settle_hand(table_id, hand)

    # The winner still collects the whole pot the loser's stakes were in
    assert hand.pot == 1000 + 1000 + 1000 + 2000
    assert _balance(db, winner) == 50000 - 1000 - 2000 + hand.pot
    assert _balance(db, loser) == 0


def test_a_bet_the_player_cannot_cover_is_reversed_and_they_are_packed(db, real_table):
    table_id, hand, users = real_table
    better = _turn_user(hand)
    user = next(u for u in users if str(u.id) == better)
    get_balance(db, user.id).balance = 0
    db.commit()
    pot_before = hand.pot

    hand.bet(better)
    tpws._collect_stakes(table_id, hand)

    seat = hand.seats[hand._seat_index(better)]
    assert hand.pot == pot_before  # the unpaid chaal is not in the pot
    assert seat.status == PlayerStatus.PACKED
    assert hand.phase == Phase.FINISHED  # only the opponent was left


def test_shutdown_refunds_stakes_of_a_hand_in_play(db, real_table):
    table_id, hand, users = real_table
    tpws.refund_live_hands()
    assert all(_balance(db, u) == 50000 for u in users)


def test_standard_chaal_limit_caps_an_oversized_blind_bet(db, real_table):
    table_id, hand, users = real_table
    assert hand.config.max_stake == 1000 * tpws.CHAAL_LIMIT_BOOTS
    better = _turn_user(hand)
    hand.bet(better, amount=10_000_000)  # tampered client: an absurd opening bet
    assert hand.current_stake == hand.config.max_stake
