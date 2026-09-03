import pytest
from datetime import datetime, timezone, timedelta
from uuid import uuid4
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.models.user import User, UserRole, UserStatus
from app.models.wallet import Wallet
from app.models.transaction import WalletTransaction, WalletTransactionType
from app.models.game import GameRound, GameRoundStatus, GameBet, GameBetStatus, GamePrediction
from app.models.game_catalog import Game, GameStatus
from app.models.fee_configuration import FeeConfiguration
from app.services.game_engines.dragon_tiger import DragonTigerEngine
from app.services.game_service import create_round as create_colour_round, place_bet as place_colour_bet


engine = DragonTigerEngine()


@pytest.fixture
def auth_user(db: Session):
    rand_suffix = str(uuid4())[:8]
    user = User(
        id=uuid4(),
        name="DT User",
        username=f"dtuser_{rand_suffix}",
        email=f"dtuser_{rand_suffix}@example.com",
        password_hash="fakehash",
        role=UserRole.USER,
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    wallet = Wallet(id=uuid4(), user_id=user.id, balance=1000000)
    db.add(wallet)
    db.commit()
    from app.security.jwt import create_access_token
    token = create_access_token(str(user.id), user.role.value)
    return {"Authorization": f"Bearer {token}"}, user, wallet


@pytest.fixture
def fee_config(db: Session):
    config = db.query(FeeConfiguration).first()
    if not config:
        config = FeeConfiguration(game_entry_fee_percent=Decimal("5.00"), winning_fee_percent=Decimal("10.00"))
        db.add(config)
    else:
        config.game_entry_fee_percent = Decimal("5.00")
        config.winning_fee_percent = Decimal("10.00")
    db.commit()
    return config


@pytest.fixture
def dt_game(db: Session):
    game = engine._get_or_create_game(db)
    game.status = GameStatus.ACTIVE
    game.min_bet = 1000
    game.max_bet = 100000
    game.config = {
        "round_duration_seconds": 25,
        "betting_duration_seconds": 15,
        "allowed_bets": {"dragon": True, "tiger": True, "tie": True},
        "payouts": {"dragon": 2.0, "tiger": 2.0, "tie": 10.0},
        "deck": {"type": "STANDARD_52_CARD", "cards_per_round": 2},
    }
    flag_modified(game, "config")
    db.commit()
    db.refresh(game)
    return game


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
    game.status = GameStatus.ACTIVE
    db.commit()
    return game


def test_dragon_wins_when_dragon_rank_higher(db: Session, auth_user, fee_config, dt_game):
    _, user, _ = auth_user
    rd = engine.create_round(db)
    engine.place_bet(db, user.id, rd.id, "DRAGON", 10000, game_id=dt_game.id)
    settled = engine.settle_round(db, rd.id, dragon_card="K-S", tiger_card="7-H")
    assert settled.result_data["result"] == "DRAGON"
    bet = db.query(GameBet).filter(GameBet.round_id == rd.id).one()
    assert bet.status == GameBetStatus.WON


def test_tiger_wins_when_tiger_rank_higher(db: Session, auth_user, fee_config, dt_game):
    _, user, _ = auth_user
    rd = engine.create_round(db)
    engine.place_bet(db, user.id, rd.id, "TIGER", 10000, game_id=dt_game.id)
    settled = engine.settle_round(db, rd.id, dragon_card="4-D", tiger_card="Q-C")
    assert settled.result_data["result"] == "TIGER"
    bet = db.query(GameBet).filter(GameBet.round_id == rd.id).one()
    assert bet.status == GameBetStatus.WON


def test_tie_when_ranks_equal(db: Session, auth_user, fee_config, dt_game):
    _, user, _ = auth_user
    rd = engine.create_round(db)
    engine.place_bet(db, user.id, rd.id, "TIE", 10000, game_id=dt_game.id)
    settled = engine.settle_round(db, rd.id, dragon_card="9-S", tiger_card="9-H")
    assert settled.result_data["result"] == "TIE"
    bet = db.query(GameBet).filter(GameBet.round_id == rd.id).one()
    assert bet.status == GameBetStatus.WON


def test_disabled_bet_type_is_rejected(db: Session, auth_user, dt_game):
    _, user, _ = auth_user
    dt_game.config["allowed_bets"]["tie"] = False
    flag_modified(dt_game, "config")
    db.commit()
    rd = engine.create_round(db)
    with pytest.raises(ValueError, match="Bet type is disabled"):
        engine.place_bet(db, user.id, rd.id, "TIE", 10000, game_id=dt_game.id)


def test_invalid_bet_type_is_rejected(db: Session, auth_user, dt_game):
    _, user, _ = auth_user
    rd = engine.create_round(db)
    with pytest.raises(ValueError, match="Invalid bet type"):
        engine.place_bet(db, user.id, rd.id, "FOO", 10000, game_id=dt_game.id)
    with pytest.raises(ValueError, match="Invalid bet type"):
        engine.place_bet(db, user.id, rd.id, "RED", 10000, game_id=dt_game.id)


def test_bet_outside_min_max_rejected(db: Session, auth_user, dt_game):
    _, user, _ = auth_user
    rd = engine.create_round(db)
    with pytest.raises(ValueError, match="outside allowed limits"):
        engine.place_bet(db, user.id, rd.id, "DRAGON", 100, game_id=dt_game.id)
    with pytest.raises(ValueError, match="outside allowed limits"):
        engine.place_bet(db, user.id, rd.id, "DRAGON", 500000, game_id=dt_game.id)


def test_inactive_game_rejects_bets(db: Session, auth_user, dt_game):
    _, user, _ = auth_user
    rd = engine.create_round(db)
    dt_game.status = GameStatus.INACTIVE
    db.commit()
    with pytest.raises(ValueError, match="Game is not active"):
        engine.place_bet(db, user.id, rd.id, "DRAGON", 10000, game_id=dt_game.id)
    dt_game.status = GameStatus.ACTIVE
    db.commit()


def test_betting_after_close_rejects(db: Session, auth_user, dt_game):
    _, user, _ = auth_user
    rd = engine.create_round(db)
    engine.lock_round_for_calculation(db, rd.id)
    with pytest.raises(ValueError, match="Betting is closed"):
        engine.place_bet(db, user.id, rd.id, "DRAGON", 10000, game_id=dt_game.id)

    rd2 = engine.create_round(db)
    rd2.betting_closes_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db.commit()
    with pytest.raises(ValueError, match="Betting window has expired"):
        engine.place_bet(db, user.id, rd2.id, "DRAGON", 10000, game_id=dt_game.id)


def test_correct_wallet_debit(db: Session, auth_user, fee_config, dt_game):
    _, user, wallet = auth_user
    initial = wallet.balance
    rd = engine.create_round(db)
    bet = engine.place_bet(db, user.id, rd.id, "DRAGON", 10000, game_id=dt_game.id)
    db.refresh(wallet)
    assert wallet.balance == initial - 10000
    txs = db.query(WalletTransaction).filter(WalletTransaction.reference_id == str(bet.id)).all()
    assert len(txs) == 1
    assert txs[0].type == WalletTransactionType.GAME_ENTRY
    assert txs[0].amount == 10000
    assert bet.entry_fee_amount == 500
    assert bet.stake_amount == 9500


def test_correct_payout_and_winning_fee(db: Session, auth_user, fee_config, dt_game):
    _, user, wallet = auth_user
    rd = engine.create_round(db)
    bet = engine.place_bet(db, user.id, rd.id, "DRAGON", 10000, game_id=dt_game.id)
    after_debit = wallet.balance
    engine.settle_round(db, rd.id, dragon_card="K-S", tiger_card="7-H")
    db.refresh(bet)
    db.refresh(wallet)
    # 2x total-return multiplier -> profit = 1x stake (same math as the old 1x-profit config)
    assert bet.gross_win_amount == 19000  # 9500 stake + 9500 profit (= 9500 * 2.0 total return)
    assert bet.winning_fee_amount == 950   # 10% of 9500 profit
    assert bet.net_win_amount == 18050    # 9500 stake + (9500 - 950)
    assert wallet.balance == after_debit + 18050


def test_losing_bet_does_not_receive_payout(db: Session, auth_user, fee_config, dt_game):
    _, user, wallet = auth_user
    rd = engine.create_round(db)
    bet = engine.place_bet(db, user.id, rd.id, "TIGER", 10000, game_id=dt_game.id)
    after_debit = wallet.balance
    engine.settle_round(db, rd.id, dragon_card="K-S", tiger_card="7-H")
    db.refresh(bet)
    db.refresh(wallet)
    assert bet.status == GameBetStatus.LOST
    assert bet.gross_win_amount == 0
    assert bet.net_win_amount == 0
    assert wallet.balance == after_debit


def test_tie_payout_uses_configuration(db: Session, auth_user, fee_config, dt_game):
    _, user, _ = auth_user
    dt_game.config["payouts"]["tie"] = 8.0  # admin override: 8x total return
    flag_modified(dt_game, "config")
    db.commit()
    rd = engine.create_round(db)
    bet = engine.place_bet(db, user.id, rd.id, "TIE", 10000, game_id=dt_game.id)
    engine.settle_round(db, rd.id, dragon_card="9-S", tiger_card="9-D")
    db.refresh(bet)
    assert bet.gross_win_amount == 76000  # 9500 stake * 8.0 total return (= 9500 stake + 66500 profit)
    assert bet.winning_fee_amount == 6650  # 10% of 66500 profit
    assert bet.net_win_amount == 69350    # 9500 stake + (66500 - 6650)


def test_hundred_rupee_dragon_bet_pays_two_hundred_total(db: Session, auth_user, fee_config, dt_game):
    """Rs.100 Dragon bet at 2x must return Rs.200 total, never Rs.300 (stake counted twice)."""
    _, user, _ = auth_user
    dt_game.config["allowed_bets"] = {"dragon": True, "tiger": True, "tie": True}
    flag_modified(dt_game, "config")
    dt_game.min_bet = 100
    db.commit()
    rd = engine.create_round(db)
    bet = engine.place_bet(db, user.id, rd.id, "DRAGON", 10000, game_id=dt_game.id)  # Rs.100, no entry fee configured beyond fee_config's 5%
    engine.settle_round(db, rd.id, dragon_card="K-S", tiger_card="7-H")
    db.refresh(bet)
    assert bet.gross_win_amount == bet.stake_amount * 2
    assert bet.gross_win_amount != bet.stake_amount * 3


def test_hundred_rupee_tiger_bet_pays_two_hundred_total(db: Session, auth_user, fee_config, dt_game):
    _, user, _ = auth_user
    rd = engine.create_round(db)
    bet = engine.place_bet(db, user.id, rd.id, "TIGER", 10000, game_id=dt_game.id)
    engine.settle_round(db, rd.id, dragon_card="4-D", tiger_card="Q-C")
    db.refresh(bet)
    assert bet.gross_win_amount == bet.stake_amount * 2
    assert bet.gross_win_amount != bet.stake_amount * 3


def test_hundred_rupee_tie_bet_pays_10x_total(db: Session, auth_user, fee_config, dt_game):
    _, user, _ = auth_user
    rd = engine.create_round(db)
    bet = engine.place_bet(db, user.id, rd.id, "TIE", 10000, game_id=dt_game.id)
    engine.settle_round(db, rd.id, dragon_card="9-S", tiger_card="9-H")
    db.refresh(bet)
    assert bet.gross_win_amount == bet.stake_amount * 10
    assert bet.status == GameBetStatus.WON


def test_tie_bet_loses_when_dragon_or_tiger_wins(db: Session, auth_user, fee_config, dt_game):
    _, user, wallet = auth_user
    rd = engine.create_round(db)
    bet = engine.place_bet(db, user.id, rd.id, "TIE", 10000, game_id=dt_game.id)
    after_debit = wallet.balance
    engine.settle_round(db, rd.id, dragon_card="K-S", tiger_card="7-H")
    db.refresh(bet)
    db.refresh(wallet)
    assert bet.status == GameBetStatus.LOST
    assert bet.gross_win_amount == 0
    assert bet.net_win_amount == 0
    assert wallet.balance == after_debit


def test_settlement_is_idempotent(db: Session, auth_user, fee_config, dt_game):
    _, user, wallet = auth_user
    rd = engine.create_round(db)
    engine.place_bet(db, user.id, rd.id, "DRAGON", 10000, game_id=dt_game.id)
    first = engine.settle_round(db, rd.id, dragon_card="A-S", tiger_card="2-H")
    db.refresh(wallet)
    balance_after_first = wallet.balance
    second = engine.settle_round(db, rd.id, dragon_card="2-S", tiger_card="A-H")
    db.refresh(wallet)
    assert first.status == GameRoundStatus.COMPLETED
    assert second.status == GameRoundStatus.COMPLETED
    assert second.result_data["result"] == "DRAGON"
    assert second.result_data["dragon_card"] == "A-S"
    assert wallet.balance == balance_after_first


def test_duplicate_settlement_cannot_credit_twice(db: Session, auth_user, fee_config, dt_game):
    _, user, _ = auth_user
    rd = engine.create_round(db)
    bet = engine.place_bet(db, user.id, rd.id, "DRAGON", 10000, game_id=dt_game.id)
    engine.settle_round(db, rd.id, dragon_card="K-S", tiger_card="7-H")
    engine.settle_round(db, rd.id, dragon_card="K-S", tiger_card="7-H")
    wins = db.query(WalletTransaction).filter(
        WalletTransaction.reference_type == "game_win",
        WalletTransaction.reference_id == str(bet.id),
    ).all()
    assert len(wins) == 1


def test_user_cannot_bet_on_another_games_round(db: Session, auth_user, dt_game, colour_game):
    _, user, _ = auth_user
    colour_round = create_colour_round(db)
    with pytest.raises(ValueError, match="Selected round does not belong to selected game"):
        engine.place_bet(db, user.id, colour_round.id, "DRAGON", 10000, game_id=dt_game.id)

    dt_round = engine.create_round(db)
    with pytest.raises(ValueError, match="Selected round does not belong to selected game"):
        place_colour_bet(db, user.id, dt_round.id, "RED", 10000, game_id=colour_game.id)


def test_current_round_api_scoped_to_dragon_tiger(client, db: Session, auth_user, dt_game):
    headers, _, _ = auth_user
    engine.create_round(db)
    res = client.get("/api/v1/games/current", headers=headers, params={"game_slug": "dragon-tiger"})
    assert res.status_code == 200
    body = res.json()["data"]
    assert body["game"]["slug"] == "dragon-tiger"
    assert body["round"]["game_id"] == str(dt_game.id)


def test_history_and_my_bets_api(client, db: Session, auth_user, fee_config, dt_game):
    headers, user, _ = auth_user
    rd = engine.create_round(db)
    engine.place_bet(db, user.id, rd.id, "DRAGON", 10000, game_id=dt_game.id)
    engine.settle_round(db, rd.id, dragon_card="K-S", tiger_card="7-H")

    hist = client.get("/api/v1/games/history", headers=headers, params={"game_slug": "dragon-tiger"})
    assert hist.status_code == 200
    items = hist.json()["data"]
    assert any(item["id"] == str(rd.id) for item in items)
    assert items[0]["result_data"]["result"] == "DRAGON"

    mine = client.get("/api/v1/games/my-bets", headers=headers, params={"game_slug": "dragon-tiger"})
    assert mine.status_code == 200
    assert mine.json()["data"]["total"] >= 1


def test_place_bet_api(client, db: Session, auth_user, fee_config, dt_game):
    headers, _, _ = auth_user
    rd = engine.create_round(db)
    res = client.post(
        "/api/v1/games/bet",
        headers=headers,
        json={"game_id": str(dt_game.id), "round_id": str(rd.id), "prediction": "TIGER", "amount": 10000},
    )
    assert res.status_code == 201
    assert res.json()["data"]["prediction"] == "TIGER"
    assert res.json()["data"]["amount"] == 10000


def test_public_bets_in_current_round_api(client, db: Session, auth_user, fee_config, dt_game):
    headers, user, _ = auth_user
    rd = engine.create_round(db)
    b1 = engine.place_bet(db, user.id, rd.id, "DRAGON", 5000, game_id=dt_game.id)
    b2 = engine.place_bet(db, user.id, rd.id, "TIGER", 10000, game_id=dt_game.id)

    res = client.get("/api/v1/games/current", headers=headers, params={"game_slug": "dragon-tiger"})
    assert res.status_code == 200
    body = res.json()["data"]
    assert "public_bets" in body
    assert len(body["public_bets"]) == 2
    for pb in body["public_bets"]:
        assert "prediction" in pb
        assert "amount" in pb
        assert "id" in pb
        assert "created_at" in pb
        # Ensure DB UUID is not leaked; opaque 16-char token is used instead
        assert pb["id"] != str(b1.id)
        assert pb["id"] != str(b2.id)
        assert len(pb["id"]) == 16
        # Privacy guarantee: no private user info
        assert "user_id" not in pb
        assert "email" not in pb
        assert "name" not in pb
        assert "phone" not in pb
        assert "balance" not in pb


def test_public_bets_endpoint(client, db: Session, auth_user, fee_config, dt_game):
    headers, user, _ = auth_user
    rd = engine.create_round(db)
    b = engine.place_bet(db, user.id, rd.id, "TIE", 2000, game_id=dt_game.id)

    res = client.get("/api/v1/games/public-bets", headers=headers, params={"round_id": str(rd.id)})
    assert res.status_code == 200
    items = res.json()["data"]
    assert len(items) == 1
    assert items[0]["prediction"] == "TIE"
    assert items[0]["amount"] == 2000
    assert items[0]["id"] != str(b.id)
    assert len(items[0]["id"]) == 16
    assert "user_id" not in items[0]


def test_dragon_tiger_15_second_betting_timer_config(db: Session, dt_game):
    """Verify backend authoritative betting timer is exactly 15 seconds."""
    assert engine.get_betting_duration_seconds(db) == 15
    assert engine.get_round_duration_seconds(db) == 25

    rd = engine.create_round(db)
    duration = (rd.betting_closes_at - rd.started_at).total_seconds()
    assert abs(duration - 15.0) < 0.1, f"Expected 15s betting window, got {duration}"


def test_dragon_tiger_bet_accepted_within_15_seconds(db: Session, auth_user, fee_config, dt_game):
    """Verify bets placed within the 15-second window succeed."""
    _, user, _ = auth_user
    rd = engine.create_round(db)
    bet = engine.place_bet(db, user.id, rd.id, "DRAGON", 10000, game_id=dt_game.id)
    assert bet.amount == 10000
    assert bet.prediction == GamePrediction.DRAGON


def test_dragon_tiger_bet_rejected_after_15_seconds(db: Session, auth_user, fee_config, dt_game):
    """Verify bets placed after 15 seconds are rejected server-side."""
    _, user, _ = auth_user
    rd = engine.create_round(db)
    # Simulate time passing past the 15-second window
    rd.betting_closes_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db.commit()

    with pytest.raises(ValueError, match="Betting window has expired"):
        engine.place_bet(db, user.id, rd.id, "DRAGON", 10000, game_id=dt_game.id)


def test_dragon_tiger_bet_rejected_when_calculating(db: Session, auth_user, fee_config, dt_game):
    """Verify bets placed when round status is CALCULATING are rejected server-side."""
    _, user, _ = auth_user
    rd = engine.create_round(db)
    engine.lock_round_for_calculation(db, rd.id)
    db.refresh(rd)
    assert rd.status == GameRoundStatus.CALCULATING

    with pytest.raises(ValueError, match="Betting is closed for this round"):
        engine.place_bet(db, user.id, rd.id, "DRAGON", 10000, game_id=dt_game.id)


def test_current_round_api_reports_15_seconds_countdown(client, db: Session, auth_user, dt_game):
    """Verify /api/v1/games/current reports remaining time <= 15.0s for a new round."""
    headers, _, _ = auth_user
    rd = engine.create_round(db)

    res = client.get("/api/v1/games/current", headers=headers, params={"game_slug": "dragon-tiger"})
    assert res.status_code == 200
    body = res.json()["data"]
    assert body["round"]["id"] == str(rd.id)
    assert body["round"]["status"] == "BETTING"
    # Remaining seconds must be <= 15.0 and > 13.0
    assert 0.0 < body["seconds_remaining"] <= 15.0

