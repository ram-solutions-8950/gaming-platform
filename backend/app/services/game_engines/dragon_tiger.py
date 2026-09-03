"""Dragon Tiger engine — rules come from Game.config, not hard-coded payouts."""

from __future__ import annotations

import copy
import uuid
from datetime import datetime, timezone, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Callable, Optional
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from .base import GameEngine
from .dragon_tiger_cards import determine_result, draw_cards
from ...models.fee_configuration import FeeConfiguration
from ...models.game import GameRound, GameRoundStatus, GameBet, GameBetStatus, GamePrediction
from ...models.game_catalog import Game, GameStatus
from ...models.transaction import WalletTransactionType
from ...services.wallet_service import debit_wallet, credit_wallet
from ...services.settlement_service import settle_winning_bet

# Authoritative defaults: 15-second betting window + 10-second calculation/animation = 25s total round
#
# Payout multiplier semantics: each value is the TOTAL RETURN multiplier, i.e. it already
# includes the original stake. total_return = stake * multiplier.
#   dragon/tiger = 2.0  -> a winning bet returns 2x stake (1x stake back + 1x stake profit).
#                          A Rs.100 bet returns Rs.200 total, not Rs.300.
#   tie          = 10.0 -> a winning bet returns 10x stake (1x stake back + 9x stake profit).
# See calculate_payout_gross() and settle_round() below, which both implement this formula.
DEFAULT_CONFIG = {
    "round_duration_seconds": 25,
    "betting_duration_seconds": 15,
    "allowed_bets": {"dragon": True, "tiger": True, "tie": True},
    "payouts": {"dragon": 2.0, "tiger": 2.0, "tie": 10.0},
    "deck": {"type": "STANDARD_52_CARD", "cards_per_round": 2},
    "min_bet": 1000,
    "max_bet": 200000,
}

KNOWN_BET_TYPES = ("dragon", "tiger", "tie")
CardDrawer = Callable[[int, str], list[str]]


def merge_dragon_tiger_config(game: Game) -> dict:
    """Deep-merge catalog JSON onto demo defaults. Engine never assumes production odds."""
    cfg = copy.deepcopy(DEFAULT_CONFIG)
    incoming = game.config or {}
    for key in ("round_duration_seconds", "betting_duration_seconds"):
        if key in incoming and incoming[key] is not None:
            cfg[key] = incoming[key]
    if incoming.get("deck"):
        cfg["deck"] = {**cfg["deck"], **incoming["deck"]}
    cfg["allowed_bets"] = {**cfg["allowed_bets"], **(incoming.get("allowed_bets") or {})}
    cfg["payouts"] = {**cfg["payouts"], **(incoming.get("payouts") or {})}
    min_b = incoming.get("min_bet") if incoming.get("min_bet") is not None else getattr(game, "min_bet", 1000)
    max_b = incoming.get("max_bet") if incoming.get("max_bet") is not None else getattr(game, "max_bet", 200000)
    cfg["min_bet"] = int(min_b) if min_b is not None else 1000
    cfg["max_bet"] = max(int(max_b) if max_b is not None else 200000, 200000)
    return cfg


def _get_fee_config(db: Session) -> tuple[Decimal, Decimal]:
    row = db.query(FeeConfiguration).first()
    if not row:
        return Decimal("0"), Decimal("0")
    return Decimal(str(row.game_entry_fee_percent)), Decimal(str(row.winning_fee_percent))


def _calc_entry_fee(amount: int, pct: Decimal) -> tuple[int, int]:
    fee = (Decimal(amount) * (pct / Decimal("100"))).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    fee_i = int(fee)
    return fee_i, amount - fee_i


def _calc_winning_fee(gross_win: int, pct: Decimal) -> tuple[int, int]:
    if gross_win <= 0:
        return 0, 0
    fee = (Decimal(gross_win) * (pct / Decimal("100"))).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    fee_i = int(fee)
    return fee_i, gross_win - fee_i


def calculate_payout_gross(
    bet_amount: int,
    bet_type: str,
    result: str,
    payout_configuration: dict,
) -> int:
    """Total return in paise: stake * multiplier on win (stake included), 0 on loss."""
    if bet_type.upper() != result.upper():
        return 0
    key = bet_type.lower()
    if key not in payout_configuration:
        raise ValueError(f"No payout configured for bet type: {bet_type}")
    mult = Decimal(str(payout_configuration[key]))
    total_return = (Decimal(bet_amount) * mult).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return int(total_return)


def _parse_prediction(prediction: str) -> GamePrediction:
    try:
        return GamePrediction(prediction.strip().upper())
    except ValueError as exc:
        raise ValueError("Invalid bet type") from exc


class DragonTigerEngine(GameEngine):
    slug = "dragon-tiger"

    def _get_or_create_game(self, db: Session) -> Game:
        game = db.query(Game).filter(Game.slug == self.slug).first()
        if game:
            changed = False
            if game.config is None:
                game.config = copy.deepcopy(DEFAULT_CONFIG)
                flag_modified(game, "config")
                changed = True
            elif game.config.get("betting_duration_seconds") != 15 or game.config.get("round_duration_seconds") != 25:
                cfg = copy.deepcopy(game.config)
                cfg["betting_duration_seconds"] = 15
                cfg["round_duration_seconds"] = 25
                game.config = cfg
                flag_modified(game, "config")
                changed = True
            if game.max_bet < 200000:
                game.max_bet = 200000
                changed = True
            if changed:
                db.commit()
                db.refresh(game)
            return game
        game = Game(
            name="Dragon Tiger",
            slug=self.slug,
            game_type="DRAGON_TIGER",
            description="Fast card battle: Dragon vs Tiger.",
            icon_url="🐉",
            status=GameStatus.ACTIVE,
            min_bet=1000,
            max_bet=200000,
            config=copy.deepcopy(DEFAULT_CONFIG),
        )
        db.add(game)
        db.commit()
        db.refresh(game)
        return game

    def create_round(self, db: Session) -> GameRound:
        game = self._get_or_create_game(db)
        cfg = merge_dragon_tiger_config(game)
        now = datetime.now(timezone.utc)
        rd = GameRound(
            game_id=game.id,
            status=GameRoundStatus.BETTING,
            started_at=now,
            betting_closes_at=now + timedelta(seconds=int(cfg["betting_duration_seconds"])),
        )
        db.add(rd)
        db.commit()
        db.refresh(rd)
        return rd

    def get_current_round(self, db: Session) -> Optional[GameRound]:
        game = self._get_or_create_game(db)
        return (
            db.query(GameRound)
            .filter(
                GameRound.game_id == game.id,
                GameRound.status.in_([GameRoundStatus.BETTING, GameRoundStatus.CALCULATING]),
            )
            .order_by(GameRound.started_at.desc())
            .first()
        )

    def get_round_history(self, db: Session, limit: int = 20) -> list[GameRound]:
        game = self._get_or_create_game(db)
        return (
            db.query(GameRound)
            .filter(GameRound.game_id == game.id, GameRound.status == GameRoundStatus.COMPLETED)
            .order_by(GameRound.ended_at.desc())
            .limit(limit)
            .all()
        )

    def place_bet(
        self,
        db: Session,
        user_id: UUID,
        round_id: UUID,
        prediction: str,
        amount: int,
        game_id: Optional[UUID] = None,
    ) -> GameBet:
        if amount <= 0:
            raise ValueError("Bet amount must be positive")

        prediction_enum = _parse_prediction(prediction)
        bet_key = prediction_enum.value.lower()

        round_row = db.execute(select(GameRound).where(GameRound.id == round_id).with_for_update()).scalar_one_or_none()
        if not round_row:
            raise ValueError("Round not found")

        game = self._get_or_create_game(db)
        selected_game_id = game_id or game.id
        if selected_game_id != game.id or round_row.game_id != game.id:
            raise ValueError("Selected round does not belong to selected game")
        if game.status != GameStatus.ACTIVE:
            raise ValueError("Game is not active")
        if round_row.status != GameRoundStatus.BETTING:
            raise ValueError("Betting is closed for this round")
        if datetime.now(timezone.utc) >= round_row.betting_closes_at:
            raise ValueError("Betting window has expired")

        cfg = merge_dragon_tiger_config(game)
        if bet_key not in KNOWN_BET_TYPES or bet_key not in cfg["allowed_bets"]:
            raise ValueError("Invalid bet type")
        if not bool(cfg["allowed_bets"].get(bet_key)):
            raise ValueError("Bet type is disabled")
        if amount < int(cfg["min_bet"]) or amount > int(cfg["max_bet"]):
            raise ValueError("Bet amount is outside allowed limits")

        entry_fee_pct, _ = _get_fee_config(db)
        entry_fee, stake = _calc_entry_fee(amount, entry_fee_pct)
        if stake <= 0:
            raise ValueError("Bet amount is too small to cover the entry fee")

        bet_id = uuid.uuid4()
        debit_wallet(
            db,
            user_id=user_id,
            amount=amount,
            tx_type=WalletTransactionType.GAME_ENTRY,
            reference_type="game_bet",
            reference_id=str(bet_id),
            metadata={"round_id": str(round_id), "prediction": prediction_enum.value, "entry_fee": entry_fee, "stake": stake},
        )
        bet = GameBet(
            id=bet_id,
            user_id=user_id,
            game_id=game.id,
            round_id=round_id,
            prediction=prediction_enum,
            amount=amount,
            entry_fee_amount=entry_fee,
            stake_amount=stake,
            status=GameBetStatus.PENDING,
        )
        db.add(bet)
        db.commit()
        db.refresh(bet)
        return bet

    def lock_round_for_calculation(self, db: Session, round_id: UUID) -> GameRound:
        rd = db.execute(select(GameRound).where(GameRound.id == round_id).with_for_update()).scalar_one_or_none()
        if not rd:
            raise ValueError("Round not found")
        if rd.status != GameRoundStatus.BETTING:
            return rd
        rd.status = GameRoundStatus.CALCULATING
        db.commit()
        db.refresh(rd)
        return rd

    def settle_round(
        self,
        db: Session,
        round_id: UUID,
        dragon_card: Optional[str] = None,
        tiger_card: Optional[str] = None,
        card_drawer: Optional[CardDrawer] = None,
    ) -> GameRound:
        rd = db.execute(select(GameRound).where(GameRound.id == round_id).with_for_update()).scalar_one_or_none()
        if not rd:
            raise ValueError("Round not found")
        if rd.status == GameRoundStatus.COMPLETED:
            return rd
        if rd.status not in (GameRoundStatus.BETTING, GameRoundStatus.CALCULATING):
            raise ValueError(f"Cannot settle round in status {rd.status.value}")

        game = self._get_or_create_game(db)
        cfg = merge_dragon_tiger_config(game)

        existing = rd.result_data or {}
        if dragon_card is None and existing.get("dragon_card"):
            dragon_card = existing["dragon_card"]
        if tiger_card is None and existing.get("tiger_card"):
            tiger_card = existing["tiger_card"]

        if dragon_card is None or tiger_card is None:
            drawer = card_drawer or (lambda count, deck_type: draw_cards(count=count, deck_type=deck_type))
            cards = list(drawer(int(cfg["deck"]["cards_per_round"]), cfg["deck"]["type"]))
            if len(cards) < 2:
                raise ValueError("Card drawer must return at least two cards")
            dragon_card, tiger_card = cards[0], cards[1]

        result = determine_result(dragon_card, tiger_card)
        rd.result_data = {
            "dragon_card": dragon_card,
            "tiger_card": tiger_card,
            "result": result,
        }
        rd.status = GameRoundStatus.COMPLETED
        rd.ended_at = datetime.now(timezone.utc)
        db.flush()

        bets = db.query(GameBet).filter(GameBet.round_id == round_id, GameBet.status == GameBetStatus.PENDING).all()
        for bet in bets:
            bet.settled_at = rd.ended_at
            if bet.prediction.value.upper() == result.upper():
                key = bet.prediction.value.lower()
                # cfg["payouts"][key] is a TOTAL RETURN multiplier (stake included).
                # settle_winning_bet() wants profit only, so subtract 1x stake here.
                mult = Decimal(str(cfg["payouts"].get(key, 2.0)))
                gross_profit = int((Decimal(bet.stake_amount) * (mult - Decimal("1"))).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
                calc, _ = settle_winning_bet(
                    db=db,
                    user_id=bet.user_id,
                    original_bet=bet.stake_amount,
                    gross_profit=gross_profit,
                    reference_type="game_win",
                    reference_id=str(bet.id),
                    game_slug=self.slug,
                    metadata={"round_id": str(round_id), "result": result},
                )
                bet.gross_win_amount = calc.original_bet + calc.gross_profit
                bet.winning_fee_amount = calc.winning_fee
                bet.net_win_amount = calc.total_return
                bet.status = GameBetStatus.WON
            else:
                bet.gross_win_amount = 0
                bet.winning_fee_amount = 0
                bet.net_win_amount = 0
                bet.status = GameBetStatus.LOST
        db.commit()
        db.refresh(rd)
        return rd

    def get_round_bets_summary(self, db: Session, round_id: UUID) -> dict:
        total_bets = db.query(func.count(GameBet.id)).filter(GameBet.round_id == round_id).scalar() or 0
        total_amount = db.query(func.coalesce(func.sum(GameBet.amount), 0)).filter(GameBet.round_id == round_id).scalar()
        return {"total_bets": total_bets, "total_amount": total_amount}

    def get_round_duration_seconds(self, db: Session) -> int:
        game = self._get_or_create_game(db)
        cfg = merge_dragon_tiger_config(game)
        return int(cfg["round_duration_seconds"])

    def get_betting_duration_seconds(self, db: Session) -> int:
        game = self._get_or_create_game(db)
        cfg = merge_dragon_tiger_config(game)
        return int(cfg["betting_duration_seconds"])
