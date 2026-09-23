"""
Admin game monitoring — one rounds/bets feed covering every round-based game.

Live Game Control used to read ``game_rounds`` and ``game_bets`` only. Aviator
keeps its rounds and bets in its own tables, so those rounds never appeared in the
list at all, and the Bets / Total Pool columns stayed at 0 for every row on a
platform where Aviator is where the betting actually happens. Both sources are
normalised to the same row shape here so the admin table can keep rendering one
list, and bet totals are aggregated per page in a single grouped query instead of
one round-trip per round.
"""

from typing import Optional, Sequence
from uuid import UUID
from datetime import datetime, timezone

from sqlalchemy.orm import Session
from sqlalchemy import func, cast, String, or_

from ..models.game import GameRound, GameBet
from ..models.game_catalog import Game
from ..models.user import User
from ..models.aviator import (
    AviatorRound, AviatorRoundStatus, AviatorBet, AviatorBetStatus,
)
from ..utils.search import normalize_search_term
from ..utils.logging import get_logger

logger = get_logger("admin_game")

AVIATOR_SLUG = "aviator"

# Source tags kept on every normalised row so bet totals and the bets drill-down
# know which table a round id belongs to.
SOURCE_GENERIC = "game_rounds"
SOURCE_AVIATOR = "aviator_rounds"

# Aviator runs its own status machine. Map it onto the three statuses the admin
# filter offers so one dropdown covers every game.
_AVIATOR_TO_GENERIC_STATUS = {
    AviatorRoundStatus.BETTING: "BETTING",
    AviatorRoundStatus.FLYING: "CALCULATING",
    AviatorRoundStatus.CRASHED: "CALCULATING",
    AviatorRoundStatus.SETTLED: "COMPLETED",
}
_GENERIC_TO_AVIATOR_STATUS = {
    "BETTING": [AviatorRoundStatus.BETTING],
    "CALCULATING": [AviatorRoundStatus.FLYING, AviatorRoundStatus.CRASHED],
    "COMPLETED": [AviatorRoundStatus.SETTLED],
}

_AVIATOR_BET_STATUS_TO_GENERIC = {
    AviatorBetStatus.CASHED_OUT: "WON",
    AviatorBetStatus.LOST: "LOST",
    AviatorBetStatus.ACTIVE: "PENDING",
}


# ── helpers ─────────────────────────────────────────────────────────

def _enum_value(value) -> Optional[str]:
    if value is None:
        return None
    return getattr(value, "value", str(value))


def _as_utc(dt: Optional[datetime]) -> datetime:
    """Comparable sort key — rounds from two tables get merged on this."""
    if dt is None:
        return datetime.min.replace(tzinfo=timezone.utc)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _user_label(user: Optional[User]) -> str:
    if user is None:
        return "Unknown"
    return user.name or user.username or "Unknown"


def _aviator_game(db: Session) -> Optional[Game]:
    return db.query(Game).filter(Game.slug == AVIATOR_SLUG).first()


# ── round rows ──────────────────────────────────────────────────────

def _generic_round_row(r: GameRound) -> dict:
    return {
        "id": str(r.id),
        "game_id": str(r.game_id),
        "status": _enum_value(r.status),
        "result_color": _enum_value(r.result_color),
        "result_number": r.result_number,
        "result_data": r.result_data,
        "started_at": r.started_at,
        "betting_closes_at": r.betting_closes_at,
        "ended_at": r.ended_at,
        "game_name": r.game.name if r.game else "Colour Prediction",
        "source": SOURCE_GENERIC,
        "total_bets": 0,
        "total_amount": 0,
    }


def _aviator_round_row(r: AviatorRound, game: Optional[Game]) -> dict:
    return {
        "id": str(r.id),
        "game_id": str(game.id) if game else "",
        "status": _AVIATOR_TO_GENERIC_STATUS.get(r.status, "COMPLETED"),
        "result_color": None,
        "result_number": None,
        # The admin table already renders `result_data.multiplier` as the round
        # result, which is exactly what an Aviator round resolves to.
        "result_data": {"multiplier": r.crash_multiplier} if r.crash_multiplier else None,
        "started_at": r.betting_started_at,
        "betting_closes_at": r.flight_started_at or r.betting_started_at,
        "ended_at": r.settled_at or r.crashed_at,
        "game_name": game.name if game else "Aviator",
        "source": SOURCE_AVIATOR,
        "total_bets": 0,
        "total_amount": 0,
    }


def _generic_rounds(
    db: Session,
    limit: int,
    game_id: Optional[UUID],
    status: Optional[str],
    term: Optional[str],
) -> tuple[int, list[dict]]:
    query = db.query(GameRound)
    if game_id is not None:
        query = query.filter(GameRound.game_id == game_id)
    if status:
        query = query.filter(GameRound.status == status)
    if term:
        query = query.filter(cast(GameRound.id, String).ilike(f"%{term}%"))
    total = query.count()
    rows = query.order_by(GameRound.started_at.desc()).limit(limit).all()
    return total, [_generic_round_row(r) for r in rows]


def _aviator_rounds(
    db: Session,
    limit: int,
    game_id: Optional[UUID],
    status: Optional[str],
    term: Optional[str],
) -> tuple[int, list[dict]]:
    game = _aviator_game(db)
    if game_id is not None and (game is None or game_id != game.id):
        return 0, []
    query = db.query(AviatorRound)
    if status:
        wanted = _GENERIC_TO_AVIATOR_STATUS.get(status.upper())
        if not wanted:
            return 0, []
        query = query.filter(AviatorRound.status.in_(wanted))
    if term:
        query = query.filter(cast(AviatorRound.id, String).ilike(f"%{term}%"))
    total = query.count()
    rows = query.order_by(AviatorRound.betting_started_at.desc()).limit(limit).all()
    return total, [_aviator_round_row(r, game) for r in rows]


def _attach_bet_totals(db: Session, rows: Sequence[dict]) -> None:
    """Fill in total_bets / total_amount for one page of rounds."""
    generic_ids = [UUID(r["id"]) for r in rows if r["source"] == SOURCE_GENERIC]
    aviator_ids = [UUID(r["id"]) for r in rows if r["source"] == SOURCE_AVIATOR]
    totals: dict[str, tuple[int, int]] = {}

    if generic_ids:
        grouped = (
            db.query(
                GameBet.round_id,
                func.count(GameBet.id),
                func.coalesce(func.sum(GameBet.amount), 0),
            )
            .filter(GameBet.round_id.in_(generic_ids))
            .group_by(GameBet.round_id)
            .all()
        )
        totals.update({str(rid): (int(count), int(amount or 0)) for rid, count, amount in grouped})

    if aviator_ids:
        grouped = (
            db.query(
                AviatorBet.round_id,
                func.count(AviatorBet.id),
                func.coalesce(func.sum(AviatorBet.amount), 0),
            )
            .filter(AviatorBet.round_id.in_(aviator_ids))
            .group_by(AviatorBet.round_id)
            .all()
        )
        totals.update({str(rid): (int(count), int(amount or 0)) for rid, count, amount in grouped})

    for row in rows:
        count, amount = totals.get(row["id"], (0, 0))
        row["total_bets"] = count
        row["total_amount"] = amount


def list_rounds(
    db: Session,
    page: int = 1,
    page_size: int = 20,
    game_id: Optional[UUID] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
) -> dict:
    """One page of rounds, newest first, across every round-based game."""
    term = normalize_search_term(search)
    status_key = (status or "").strip().upper() or None
    if status_key in ("ALL", ""):
        status_key = None

    # The globally newest N rounds are contained in the newest N of each source,
    # so fetching that many from both is enough to slice the requested page.
    fetch_upto = max(page * page_size, page_size)

    generic_total, generic_rows = _generic_rounds(db, fetch_upto, game_id, status_key, term)
    aviator_total, aviator_rows = _aviator_rounds(db, fetch_upto, game_id, status_key, term)

    merged = sorted(
        generic_rows + aviator_rows,
        key=lambda row: _as_utc(row["started_at"]),
        reverse=True,
    )
    offset = (page - 1) * page_size
    items = merged[offset:offset + page_size]
    _attach_bet_totals(db, items)

    return {
        "total": generic_total + aviator_total,
        "page": page,
        "page_size": page_size,
        "items": items,
    }


# ── bet rows ────────────────────────────────────────────────────────

def _generic_bet_row(b: GameBet) -> dict:
    return {
        "id": str(b.id),
        "user_id": str(b.user_id),
        "game_id": str(b.game_id),
        "round_id": str(b.round_id),
        "prediction": _enum_value(b.prediction),
        "amount": b.amount,
        "entry_fee_amount": b.entry_fee_amount,
        "stake_amount": b.stake_amount,
        "gross_win_amount": b.gross_win_amount,
        "winning_fee_amount": b.winning_fee_amount,
        "net_win_amount": b.net_win_amount,
        "status": _enum_value(b.status),
        "created_at": b.created_at,
        "settled_at": b.settled_at,
        "game_name": b.game.name if b.game else "Colour Prediction",
        "user_name": _user_label(b.user),
    }


def _aviator_bet_row(b: AviatorBet, game: Optional[Game], user: Optional[User]) -> dict:
    payout = b.payout or 0
    prediction = f"Slot {b.slot}"
    if b.cashout_multiplier:
        prediction = f"{prediction} @ {b.cashout_multiplier:.2f}x"
    elif b.auto_cashout:
        prediction = f"{prediction} (auto {b.auto_cashout:.2f}x)"
    return {
        "id": str(b.id),
        "user_id": str(b.user_id),
        "game_id": str(game.id) if game else "",
        "round_id": str(b.round_id),
        "prediction": prediction,
        "amount": b.amount,
        # Aviator takes its cut out of the payout, not the stake.
        "entry_fee_amount": 0,
        "stake_amount": b.amount,
        "gross_win_amount": payout or None,
        "winning_fee_amount": 0,
        "net_win_amount": payout or None,
        "status": _AVIATOR_BET_STATUS_TO_GENERIC.get(b.status, "PENDING"),
        "created_at": b.created_at,
        "settled_at": b.cashed_out_at,
        "game_name": game.name if game else "Aviator",
        "user_name": _user_label(user),
    }


def _is_aviator_round(db: Session, round_id: UUID) -> bool:
    return db.query(AviatorRound.id).filter(AviatorRound.id == round_id).first() is not None


def _aviator_bets(
    db: Session,
    round_id: Optional[UUID],
    page: int,
    page_size: int,
    term: Optional[str],
) -> dict:
    query = db.query(AviatorBet, User).outerjoin(User, AviatorBet.user_id == User.id)
    if round_id is not None:
        query = query.filter(AviatorBet.round_id == round_id)
    if term:
        like = f"%{term}%"
        query = query.filter(
            or_(
                cast(AviatorBet.id, String).ilike(like),
                cast(AviatorBet.round_id, String).ilike(like),
                cast(AviatorBet.user_id, String).ilike(like),
                User.username.ilike(like),
                User.name.ilike(like),
            )
        )
    total = query.count()
    rows = (
        query.order_by(AviatorBet.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    game = _aviator_game(db)
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [_aviator_bet_row(bet, game, user) for bet, user in rows],
    }


def _generic_bets(
    db: Session,
    round_id: Optional[UUID],
    page: int,
    page_size: int,
    game_id: Optional[UUID],
    term: Optional[str],
) -> dict:
    query = db.query(GameBet)
    if round_id is not None:
        query = query.filter(GameBet.round_id == round_id)
    elif game_id is not None:
        query = query.filter(GameBet.game_id == game_id)
    if term:
        like = f"%{term}%"
        query = query.join(GameBet.user).filter(
            or_(
                cast(GameBet.id, String).ilike(like),
                cast(GameBet.round_id, String).ilike(like),
                cast(GameBet.user_id, String).ilike(like),
                User.username.ilike(like),
                User.name.ilike(like),
            )
        )
    total = query.count()
    rows = (
        query.order_by(GameBet.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [_generic_bet_row(b) for b in rows],
    }


def list_bets(
    db: Session,
    round_id: Optional[UUID] = None,
    page: int = 1,
    page_size: int = 20,
    game_id: Optional[UUID] = None,
    search: Optional[str] = None,
) -> dict:
    """One page of bets for a round, from whichever table owns that round."""
    term = normalize_search_term(search)
    aviator_game = _aviator_game(db)
    is_aviator = (
        (round_id is not None and _is_aviator_round(db, round_id))
        or (round_id is None and game_id is not None and aviator_game is not None and game_id == aviator_game.id)
    )
    if is_aviator:
        return _aviator_bets(db, round_id, page, page_size, term)
    return _generic_bets(db, round_id, page, page_size, game_id, term)
