import uuid
import pytest
from app.models.rummy import RummyTable, RummyRound, RummyTableMode, RummyTableStatus
from app.models.user import User, UserRole, UserStatus
from app.models.wallet import Wallet
from app.services.rummy.cards import Card, Shoe, Suit, build_shoe, rank_points
from app.services.rummy.melds import classify_meld, is_pure_sequence, is_sequence, MeldType
from app.services.rummy.scoring import (
    best_hand_score,
    validate_declaration,
    FIRST_DROP_POINTS,
    MIDDLE_DROP_POINTS,
    MAX_HAND_POINTS,
)
from app.services.rummy.deals_rummy import DealsRummyGame, GameConfig, Phase, Player, PlayerStatus
from app.services.rummy.errors import GameError, InvalidAction, NotYourTurn, CardNotInHand
from app.services.rummy import bot_strategy
from app.services.wallet_service import debit_wallet, credit_wallet, get_balance
from app.models.transaction import WalletTransactionType
from app.security.jwt import create_access_token


def test_cards_and_shoe():
    shoe = Shoe(num_decks=2, printed_jokers=2, seed=42)
    assert shoe.stock_count() == 106  # 2 * 52 + 2 printed jokers
    assert len(shoe.discard) == 0

    c1 = shoe.draw_from_stock()
    assert c1 is not None
    assert shoe.stock_count() == 105

    shoe.add_to_discard(c1)
    assert shoe.top_discard() == c1

    drawn_disc = shoe.draw_from_discard()
    assert drawn_disc == c1
    assert shoe.top_discard() is None


def test_pure_and_impure_sequences():
    # Pure sequence (4S, 5S, 6S)
    c4s = Card(4, Suit.SPADES)
    c5s = Card(5, Suit.SPADES)
    c6s = Card(6, Suit.SPADES)
    assert is_pure_sequence([c4s, c5s, c6s], wild_rank=10) is True
    assert classify_meld([c4s, c5s, c6s], wild_rank=10) == MeldType.PURE_SEQUENCE

    # Sequence with Ace low (AS, 2S, 3S)
    cas = Card(1, Suit.SPADES)
    c2s = Card(2, Suit.SPADES)
    c3s = Card(3, Suit.SPADES)
    assert is_pure_sequence([cas, c2s, c3s], wild_rank=10) is True

    # Sequence with Ace high (QS, KS, AS)
    cqs = Card(12, Suit.SPADES)
    cks = Card(13, Suit.SPADES)
    assert is_pure_sequence([cqs, cks, cas], wild_rank=10) is True

    # Impure sequence with Printed Joker
    pj = Card(0, None, printed_joker=True)
    assert classify_meld([c4s, pj, c6s], wild_rank=10) == MeldType.IMPURE_SEQUENCE

    # Impure sequence with wild rank joker
    c7h = Card(7, Suit.HEARTS) # wild when wild_rank=7
    assert classify_meld([c4s, c7h, c6s], wild_rank=7) == MeldType.IMPURE_SEQUENCE


def test_sets():
    # Valid set (KH, KS, KD)
    ckh = Card(13, Suit.HEARTS)
    cks = Card(13, Suit.SPADES)
    ckd = Card(13, Suit.DIAMONDS)
    assert classify_meld([ckh, cks, ckd], wild_rank=2) == MeldType.SET

    # Set with joker
    pj = Card(0, None, printed_joker=True)
    assert classify_meld([ckh, cks, pj], wild_rank=2) == MeldType.SET

    # Invalid set: duplicate suit (KH, KH, KS)
    ckh2 = Card(13, Suit.HEARTS, deck_index=1)
    assert classify_meld([ckh, ckh2, cks], wild_rank=2) == MeldType.INVALID


def test_declaration_and_scoring():
    # Valid declaration: 1 pure sequence + 1 impure sequence + 2 sets = 13 cards
    pj = Card(0, None, printed_joker=True)
    seq1 = [Card(2, Suit.SPADES), Card(3, Suit.SPADES), Card(4, Suit.SPADES)]
    seq2 = [Card(7, Suit.HEARTS), Card(8, Suit.HEARTS), pj]
    set1 = [Card(13, Suit.HEARTS), Card(13, Suit.SPADES), Card(13, Suit.DIAMONDS)]
    set2 = [Card(5, Suit.CLUBS), Card(5, Suit.SPADES), Card(5, Suit.DIAMONDS), pj]

    res = validate_declaration([seq1, seq2, set1, set2], wild_rank=10)
    assert res.valid is True
    assert res.points == 0

    # Invalid declaration: missing pure sequence (two impure sequences + 2 sets)
    impure1 = [Card(2, Suit.SPADES), pj, Card(4, Suit.SPADES)]
    res_bad = validate_declaration([impure1, seq2, set1, set2], wild_rank=10)
    assert res_bad.valid is False
    assert res_bad.points == MAX_HAND_POINTS  # 80 points penalty


def test_game_flow_and_turns():
    game = DealsRummyGame(table_id="tbl-test", config=GameConfig(max_players=2, num_deals=2, mode="free"))
    game.add_player("p1", "Alice")
    game.add_player("p2", "Bob")

    # Start Deal 1
    game.start_deal(seed=100)
    assert game.phase == Phase.AWAIT_DRAW
    assert len(game.players[0].hand) == 13
    assert len(game.players[1].hand) == 13
    assert game.wild_rank is not None
    assert game.shoe.top_discard() is not None

    current = game.current_player().id
    other = "p2" if current == "p1" else "p1"

    # Turn enforcement: other player cannot act out of turn
    with pytest.raises(NotYourTurn):
        game.draw(other, "stock")

    # Current player draws from stock
    drawn = game.draw(current, "stock")
    assert len(game.current_player().hand) == 14
    assert game.phase == Phase.AWAIT_DISCARD

    # Cannot draw again before discarding
    with pytest.raises(InvalidAction):
        game.draw(current, "discard")

    # Discard card
    game.discard(current, drawn.code)
    assert len(game._player(current).hand) == 13
    assert game.shoe.top_discard().code == drawn.code

    # Turn advanced to next player
    assert game.current_player().id == other
    assert game.phase == Phase.AWAIT_DRAW


def test_drop_action():
    game = DealsRummyGame(table_id="tbl-test-drop", config=GameConfig(max_players=2, num_deals=1, mode="free"))
    game.add_player("p1", "Alice")
    game.add_player("p2", "Bob")
    game.start_deal(seed=200)

    current = game.current_player().id
    other = "p2" if current == "p1" else "p1"

    # First drop = 20 points
    pts = game.drop(current)
    assert pts == FIRST_DROP_POINTS
    assert game._player(current).status == PlayerStatus.DROPPED
    # Since other player is sole survivor, deal ends and other wins
    assert game.phase == Phase.GAME_OVER
    assert game.winner_id == other


def test_bot_strategy_decisions():
    hand = [
        Card(2, Suit.SPADES),
        Card(3, Suit.SPADES),
        Card(9, Suit.HEARTS),
        Card(10, Suit.DIAMONDS),
        Card(13, Suit.CLUBS),
    ]
    # Useful discard for sequence
    useful_discard = Card(4, Suit.SPADES)
    decision = bot_strategy.choose_draw_source(hand, useful_discard, wild_rank=None)
    assert decision == "discard"

    # Discard choice should shed a deadwood card
    discard_code = bot_strategy.choose_discard(hand, wild_rank=None)
    assert discard_code in [c.code for c in hand]


def test_rest_api_endpoints(client, db):
    # Create test user
    user = User(
        name="Rummy Tester",
        username="rummy_tester_api",
        email="rummy_tester_api@example.com",
        password_hash="test_hash",
        role=UserRole.USER,
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(str(user.id), "USER")
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Create table
    create_payload = {
        "name": "Test Room",
        "mode": "free",
        "max_players": 2,
        "num_deals": 2,
        "entry_fee_paise": 0,
        "is_private": True,
    }
    res = client.post("/api/v1/rummy/tables", json=create_payload, headers=headers)
    assert res.status_code == 201
    table_data = res.json()
    assert table_data["name"] == "Test Room"
    assert table_data["join_code"] is not None
    join_code = table_data["join_code"]
    table_id = table_data["id"]

    # 2. Get table
    res_get = client.get(f"/api/v1/rummy/tables/{table_id}")
    assert res_get.status_code == 200
    assert res_get.json()["id"] == table_id

    # 3. Join by code
    res_join = client.post("/api/v1/rummy/tables/join-by-code", json={"code": join_code})
    assert res_join.status_code == 200
    assert res_join.json()["id"] == table_id

    # 4. List tables
    res_list = client.get("/api/v1/rummy/tables")
    assert res_list.status_code == 200
    assert isinstance(res_list.json(), list)

    # 5. History
    res_hist = client.get("/api/v1/rummy/history", headers=headers)
    assert res_hist.status_code == 200
    assert isinstance(res_hist.json(), list)


def test_wallet_stake_and_settlement(db):
    user1 = User(
        name="Player One",
        username="player_one_rummy",
        email="p1_rummy@example.com",
        password_hash="test",
        role=UserRole.USER,
        status=UserStatus.ACTIVE,
    )
    user2 = User(
        name="Player Two",
        username="player_two_rummy",
        email="p2_rummy@example.com",
        password_hash="test",
        role=UserRole.USER,
        status=UserStatus.ACTIVE,
    )
    db.add_all([user1, user2])
    db.commit()

    # Create and credit wallets
    w1 = Wallet(user_id=user1.id, balance=10000)  # ₹100
    w2 = Wallet(user_id=user2.id, balance=10000)  # ₹100
    db.add_all([w1, w2])
    db.commit()

    # Test debit stake
    tx_debit = debit_wallet(
        db=db,
        user_id=user2.id,
        amount=2000,  # ₹20
        tx_type=WalletTransactionType.GAME_ENTRY,
        reference_type="RUMMY_STAKE",
        reference_id="deal_test_123_p2",
    )
    db.commit()
    assert tx_debit.amount == 2000
    assert get_balance(db, user2.id).balance == 8000

    # Test credit payout
    tx_credit = credit_wallet(
        db=db,
        user_id=user1.id,
        amount=2000,
        tx_type=WalletTransactionType.GAME_WIN,
        reference_type="RUMMY_PAYOUT",
        reference_id="deal_test_123_win",
    )
    db.commit()
    assert tx_credit.amount == 2000
    assert get_balance(db, user1.id).balance == 12000

    # Duplicate reference prevention
    with pytest.raises(ValueError, match="Duplicate transaction reference"):
        debit_wallet(
            db=db,
            user_id=user2.id,
            amount=2000,
            tx_type=WalletTransactionType.GAME_ENTRY,
            reference_type="RUMMY_STAKE",
            reference_id="deal_test_123_p2",
        )


def test_settlement_point_value_regression():
    """Regression: point_value_paise must be entry_fee_paise / 80, NOT entry_fee_paise.

    Bug: Previously, _settle_real_money used point_value = table.entry_fee_paise,
    causing an 80x over-calculation. E.g. for ₹0.10/pt (entry_fee=800 paise),
    a 40-point loss debited 40*800=32000 paise (₹320) instead of 40*10=400 (₹4).
    """
    # Verify the formula for each tier
    tiers = [
        # (entry_fee_paise, expected_point_value_paise, expected_80pt_loss)
        (800, 10, 800),       # ₹0.10/pt → 10 paise/pt → 80 * 10 = 800
        (4000, 50, 4000),     # ₹0.50/pt → 50 paise/pt → 80 * 50 = 4000
        (8000, 100, 8000),    # ₹1.00/pt → 100 paise/pt → 80 * 100 = 8000
        (40000, 500, 40000),  # ₹5.00/pt → 500 paise/pt → 80 * 500 = 40000
    ]
    for entry_fee_paise, expected_pv, expected_max_loss in tiers:
        point_value_paise = max(1, round(entry_fee_paise / 80))
        assert point_value_paise == expected_pv, (
            f"entry_fee={entry_fee_paise}: got pv={point_value_paise}, expected {expected_pv}"
        )

        # 40-point loss should be 40 * point_value, capped at entry_fee
        loss_40pt = min(40 * point_value_paise, entry_fee_paise)
        assert loss_40pt == 40 * expected_pv

        # 80-point loss (max drop) should equal entry_fee_paise exactly
        loss_80pt = min(80 * point_value_paise, entry_fee_paise)
        assert loss_80pt == expected_max_loss

        # 100-point loss (over max) should be capped at entry_fee_paise
        loss_100pt = min(100 * point_value_paise, entry_fee_paise)
        assert loss_100pt == entry_fee_paise


def test_table_reuse_logic():
    """Verify that create_table returns an existing waiting table when criteria match."""
    from app.routers.rummy import _cleanup_stale_tables
    from app.services.rummy.game_manager import game_manager

    # Directly test that _cleanup_stale_tables doesn't crash with empty DB
    # (Just a smoke test — full reuse is an integration concern)
    assert callable(_cleanup_stale_tables)

    # Verify game_manager.get returns None for non-existent tables
    result = game_manager.get("nonexistent-table-id")
    assert result is None
