"""Andar Bahar engine — server-authoritative card game logic with wallet settlement."""

from __future__ import annotations

import copy
import hashlib
import hmac
import random
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import List, Optional, Tuple
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.orm import Session

from .base import GameEngine
from ...models.fee_configuration import FeeConfiguration
from ...models.game import GameRound, GameRoundStatus, GameBet, GameBetStatus, GamePrediction
from ...models.game_catalog import Game, GameStatus
from ...models.transaction import WalletTransactionType
from ...services.wallet_service import debit_wallet, credit_wallet

DEFAULT_CONFIG = {
    "round_duration_seconds": 18,
    "betting_duration_seconds": 15,
    "allowed_bets": {"andar": True, "bahar": True},
    "payouts": {"andar": 0.9, "bahar": 1.0},
    "min_bet": 1000,
    "max_bet": 500000,
}

KNOWN_BET_TYPES = ("andar", "bahar")
SUITS = ("S", "H", "D", "C")
SUIT_GLYPHS = {"S": "♠", "H": "♥", "D": "♦", "C": "♣"}
RANK_LABELS = {1: "A", 11: "J", 12: "Q", 13: "K"}


@dataclass(frozen=True)
class Card:
    rank: int  # 1..13
    suit: str  # S, H, D, C

    @property
    def is_red(self) -> bool:
        return self.suit in ("H", "D")

    @property
    def label(self) -> str:
        r = RANK_LABELS.get(self.rank, str(self.rank))
        s = SUIT_GLYPHS.get(self.suit, self.suit)
        return f"{r}{s}"

    def as_dict(self) -> dict:
        return {
            "rank": self.rank,
            "suit": self.suit,
            "label": self.label,
        }


def fresh_deck() -> List[Card]:
    return [Card(rank, suit) for suit in SUITS for rank in range(1, 14)]


def start_side(middle: Card) -> str:
    # Black card (♠/♣) deals to ANDAR first; Red card (♥/♦) deals to BAHAR first
    return "bahar" if middle.is_red else "andar"


def derive_seed(server_seed: str, client_seed: str, nonce: int) -> int:
    digest = hmac.new(
        server_seed.encode(), f"{client_seed}:{nonce}".encode(), hashlib.sha256
    ).hexdigest()
    return int(digest[:16], 16)


def deal_round(server_seed: Optional[str] = None, client_seed: str = "default", nonce: int = 1) -> dict:
    """Execute a server-authoritative Andar Bahar card deal."""
    s_seed = server_seed or secrets.token_hex(16)
    seed = derive_seed(s_seed, client_seed, nonce)
    rng = random.Random(seed)
    deck = fresh_deck()
    rng.shuffle(deck)

    middle = deck[0]
    rest = deck[1:]
    first_side = start_side(middle)

    andar_cards: List[Card] = []
    bahar_cards: List[Card] = []
    steps: List[dict] = []

    curr_side = first_side
    winner = first_side

    for card in rest:
        if curr_side == "andar":
            andar_cards.append(card)
        else:
            bahar_cards.append(card)
        steps.append({"side": curr_side, "card": card.as_dict()})

        if card.rank == middle.rank:
            winner = curr_side
            break
        curr_side = "bahar" if curr_side == "andar" else "andar"

    winner_upper = winner.upper()
    return {
        "middle": middle.as_dict(),
        "startSide": first_side,
        "steps": steps,
        "andar": [c.as_dict() for c in andar_cards],
        "bahar": [c.as_dict() for c in bahar_cards],
        "winner": winner_upper,
        "result": winner_upper,
        "cardsDealt": len(steps),
        "server_seed_hash": hashlib.sha256(s_seed.encode()).hexdigest(),
        "server_seed": s_seed,
    }


def merge_andar_bahar_config(game: Game) -> dict:
    cfg = copy.deepcopy(DEFAULT_CONFIG)
    incoming = game.config or {}
    for key in ("round_duration_seconds", "betting_duration_seconds"):
        if key in incoming and incoming[key] is not None:
            cfg[key] = incoming[key]
    # Enforce synchronized 15s betting + 3s calculation = 18s total round lifecycle
    cfg["round_duration_seconds"] = 18
    cfg["betting_duration_seconds"] = 15
    cfg["allowed_bets"] = {**cfg["allowed_bets"], **(incoming.get("allowed_bets") or {})}
    cfg["payouts"] = {**cfg["payouts"], **(incoming.get("payouts") or {})}
    cfg["min_bet"] = int(incoming["min_bet"]) if incoming.get("min_bet") is not None else int(game.min_bet)
    cfg["max_bet"] = int(incoming["max_bet"]) if incoming.get("max_bet") is not None else int(game.max_bet)
    return cfg


def _get_fee_config(db: Session) -> Tuple[Decimal, Decimal]:
    cfg = db.query(FeeConfiguration).first()
    if not cfg:
        return Decimal("0.02"), Decimal("0.05")
    return (
        Decimal(str(cfg.game_entry_fee_percent)) / Decimal("100"),
        Decimal(str(cfg.winning_fee_percent)) / Decimal("100"),
    )


def _calc_entry_fee(amount: int, fee_pct: Decimal) -> Tuple[int, int]:
    fee = (Decimal(amount) * fee_pct).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    fee_int = int(fee)
    stake_int = amount - fee_int
    return fee_int, stake_int


def _calc_winning_fee(gross_profit: int, fee_pct: Decimal) -> Tuple[int, int]:
    if gross_profit <= 0:
        return 0, 0
    fee = (Decimal(gross_profit) * fee_pct).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    fee_int = int(fee)
    return fee_int, gross_profit - fee_int


def calculate_payout_gross(
    bet_amount: int,
    bet_type: str,
    winner: str,
    payout_configuration: dict,
) -> int:
    if bet_type.lower() != winner.lower():
        return 0
    key = bet_type.lower()
    if key not in payout_configuration:
        raise ValueError(f"No payout configured for bet type: {bet_type}")
    mult = Decimal(str(payout_configuration[key]))
    net_win = (Decimal(bet_amount) * mult).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return int(Decimal(bet_amount) + net_win)


class AndarBaharEngine(GameEngine):
    slug = "andar-bahar"

    def _get_or_create_game(self, db: Session) -> Game:
        game = db.query(Game).filter(Game.slug == self.slug).first()
        if game:
            cfg = dict(game.config or copy.deepcopy(DEFAULT_CONFIG))
            if cfg.get("round_duration_seconds") != 18 or cfg.get("betting_duration_seconds") != 15:
                cfg["round_duration_seconds"] = 18
                cfg["betting_duration_seconds"] = 15
                game.config = cfg
                db.commit()
                db.refresh(game)
            return game
        game = Game(
            name="Andar Bahar",
            slug=self.slug,
            game_type="ANDAR_BAHAR",
            description="Traditional Indian card game: Andar vs Bahar.",
            icon_url="🎴",
            status=GameStatus.ACTIVE,
            min_bet=1000,
            max_bet=500000,
            config=copy.deepcopy(DEFAULT_CONFIG),
        )
        db.add(game)
        db.commit()
        db.refresh(game)
        return game

    def create_round(self, db: Session) -> GameRound:
        game = self._get_or_create_game(db)
        cfg = merge_andar_bahar_config(game)
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

        pred_upper = prediction.strip().upper()
        if pred_upper not in ("ANDAR", "BAHAR"):
            raise ValueError("Invalid bet type: must be ANDAR or BAHAR")

        prediction_enum = GamePrediction(pred_upper)
        bet_key = pred_upper.lower()

        round_row = db.execute(
            select(GameRound).where(GameRound.id == round_id).with_for_update()
        ).scalar_one_or_none()
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

        cfg = merge_andar_bahar_config(game)
        if bet_key not in KNOWN_BET_TYPES or not bool(cfg["allowed_bets"].get(bet_key)):
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
            metadata={
                "round_id": str(round_id),
                "prediction": prediction_enum.value,
                "entry_fee": entry_fee,
                "stake": stake,
            },
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
        rd = db.execute(
            select(GameRound).where(GameRound.id == round_id).with_for_update()
        ).scalar_one_or_none()
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
        predetermined_deal: Optional[dict] = None,
    ) -> GameRound:
        rd = db.execute(
            select(GameRound).where(GameRound.id == round_id).with_for_update()
        ).scalar_one_or_none()
        if not rd:
            raise ValueError("Round not found")
        if rd.status == GameRoundStatus.COMPLETED:
            return rd
        if rd.status not in (GameRoundStatus.BETTING, GameRoundStatus.CALCULATING):
            raise ValueError(f"Cannot settle round in status {rd.status.value}")

        game = self._get_or_create_game(db)
        cfg = merge_andar_bahar_config(game)

        # Server-authoritative card deal
        deal_result = predetermined_deal or deal_round()
        winner = deal_result["winner"].upper()

        rd.result_data = deal_result
        rd.status = GameRoundStatus.COMPLETED
        rd.ended_at = datetime.now(timezone.utc)
        db.flush()

        _, winning_fee_pct = _get_fee_config(db)
        bets = (
            db.query(GameBet)
            .filter(GameBet.round_id == round_id, GameBet.status == GameBetStatus.PENDING)
            .all()
        )
        for bet in bets:
            gross_return = calculate_payout_gross(
                bet_amount=bet.stake_amount,
                bet_type=bet.prediction.value,
                winner=winner,
                payout_configuration=cfg["payouts"],
            )
            bet.settled_at = rd.ended_at
            if gross_return > 0:
                net_profit = gross_return - bet.stake_amount
                w_fee, _ = _calc_winning_fee(net_profit, winning_fee_pct)
                final_credit = gross_return - w_fee

                bet.gross_win_amount = gross_return
                bet.winning_fee_amount = w_fee
                bet.net_win_amount = final_credit
                bet.status = GameBetStatus.WON

                if final_credit > 0:
                    try:
                        credit_wallet(
                            db,
                            user_id=bet.user_id,
                            amount=final_credit,
                            tx_type=WalletTransactionType.GAME_WIN,
                            reference_type="game_win",
                            reference_id=str(bet.id),
                            metadata={
                                "round_id": str(round_id),
                                "gross_win": gross_return,
                                "winning_fee": w_fee,
                                "net_win": final_credit,
                                "winner": winner,
                            },
                        )
                    except ValueError as exc:
                        if "Duplicate transaction reference" not in str(exc):
                            raise
            else:
                bet.gross_win_amount = 0
                bet.winning_fee_amount = 0
                bet.net_win_amount = 0
                bet.status = GameBetStatus.LOST

        db.commit()
        db.refresh(rd)
        return rd

    def get_round_bets_summary(self, db: Session, round_id: UUID) -> dict:
        total_bets = (
            db.query(func.count(GameBet.id)).filter(GameBet.round_id == round_id).scalar() or 0
        )
        total_amount = (
            db.query(func.coalesce(func.sum(GameBet.amount), 0))
            .filter(GameBet.round_id == round_id)
            .scalar()
        )
        return {"total_bets": total_bets, "total_amount": total_amount}

    def get_round_duration_seconds(self, db: Session) -> int:
        game = self._get_or_create_game(db)
        cfg = merge_andar_bahar_config(game)
        return int(cfg["round_duration_seconds"])

    def get_betting_duration_seconds(self, db: Session) -> int:
        game = self._get_or_create_game(db)
        cfg = merge_andar_bahar_config(game)
        return int(cfg["betting_duration_seconds"])
