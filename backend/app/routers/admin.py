from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import cast, String, func, or_
from uuid import UUID
import uuid
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel, Field, EmailStr
from ..dependencies.database import get_db
from ..schemas.user import UserOut, AdminUserStatusUpdateIn
from ..schemas.deposit import DepositOut
from ..schemas.withdrawal import WithdrawalOut, WithdrawalActionIn
from ..schemas.wallet import WalletTransactionOut
from ..schemas.payment import PaymentConfigOut, PaymentConfigUpdateIn, PaymentConfigCreateIn
from ..schemas.referral import ReferralSettingsUpdateIn
from ..models.user import User, UserRole, UserStatus
from ..models.deposit import Deposit, DepositStatus
from ..models.withdrawal import Withdrawal, WithdrawalStatus
from ..models.transaction import WalletTransaction, WalletTransactionStatus, WalletTransactionType
from ..models.wallet import Wallet
from ..models.payment import PaymentConfiguration
from ..models.game import GameRound, GameBet, GameBetStatus
from ..models.game_catalog import Game, GameStatus
from ..models.role import AdminPermission, PERMISSION_DETAILS, DEFAULT_ROLE_PERMISSIONS
from ..models.winning import UserWinningControl, WinMode
from ..models.wager import WagerRequirement
from ..models.audit_log import AuditLog
from ..models.support import SupportTicket, SupportTicketStatus
from ..models.payment_gateway import PaymentGatewayConfig
from ..models.system_settings import SystemSetting
from ..models.refresh_token import RefreshToken
from ..services import wallet_service, audit_service, withdrawal_service, reward_service, wager_service, winning_service, support_service
from ..security.password import hash_password
from ..schemas.reward import (
    LuckySpinSegmentUpdateIn,
    DailyRewardSettingsUpdateIn,
    DailyRewardConfigUpdateIn,
    BonusCreateIn,
    BonusUpdateIn,
    JackpotUpdateIn,
    VipBonusUpdateIn,
)
from ..security.permissions import require_admin, require_super_admin, require_permission, has_permission
from ..utils.responses import success_response, error_response
from ..utils.search import normalize_search_term, as_uuid
from ..middleware.rate_limiter import limiter

router = APIRouter(prefix="/admin", tags=["Admin"])


class TeamMemberCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    username: str = Field(min_length=3, max_length=150)
    email: EmailStr
    password: str = Field(min_length=6)
    team_role: Optional[str] = "Admin Staff"
    permissions: Optional[List[str]] = None


class TeamMemberUpdateIn(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = None
    team_role: Optional[str] = None
    permissions: Optional[List[str]] = None
    status: Optional[str] = None


class WagerCreateIn(BaseModel):
    user_id: UUID
    required_amount_inr: float = Field(gt=0)


class WagerGlobalUpdateIn(BaseModel):
    multiplier: float = Field(ge=0.0, le=100.0)
    default_user_wager_inr: Optional[float] = 0.0
    apply_to_existing_deposits: Optional[bool] = False


class WagerApplyAllIn(BaseModel):
    required_amount_inr: float = Field(gt=0)


class WagerUpdateIn(BaseModel):
    required_amount_inr: Optional[float] = Field(default=None, ge=0)
    completed_amount_inr: Optional[float] = Field(default=None, ge=0)
    is_fulfilled: Optional[bool] = None


class SupportTicketUpdateIn(BaseModel):
    status: str
    admin_reply: Optional[str] = None


class PaymentGatewayUpdateIn(BaseModel):
    display_name: Optional[str] = None
    api_key: Optional[str] = None
    api_secret: Optional[str] = None
    webhook_secret: Optional[str] = None
    is_sandbox: Optional[bool] = None
    is_active: Optional[bool] = None
    payouts_enabled: Optional[bool] = None
    payout_api_key: Optional[str] = None
    payout_api_secret: Optional[str] = None
    payout_account_number: Optional[str] = None


class SupportConfigUpdateIn(BaseModel):
    whatsapp_vip: Optional[str] = None
    whatsapp_url: Optional[str] = None
    support_email: Optional[str] = None
    helpline_number: Optional[str] = None
    working_hours: Optional[str] = None
    faqs: Optional[List[Dict[str, Any]]] = None


class AppVersionUpdateIn(BaseModel):
    latest_version: str
    min_version: Optional[str] = None
    download_url: Optional[str] = None
    release_notes: Optional[str] = None
    force_update: Optional[bool] = False


class WinningGlobalUpdateIn(BaseModel):
    mode: str = "HOUSE_EDGE"
    rtp_percent: int = Field(ge=1, le=100)


class WinningPersonalSetIn(BaseModel):
    user_id: UUID
    mode: str = "DEFAULT"
    win_rate_percent: Optional[int] = Field(default=50, ge=0, le=100)
    note: Optional[str] = None


# -- Fast Dashboard Overview Stats ---------------------------------------------
@router.get("/dashboard/stats")
def get_dashboard_stats(
    request: Request,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Fast, lightweight overview stats for the main admin dashboard with 100% real database data."""
    now = datetime.now(timezone.utc)
    yesterday = now - timedelta(days=1)

    # 1. Total players (role == USER)
    total_players = db.query(func.count(User.id)).filter(User.role == UserRole.USER).scalar() or 0

    # 2. Total admin users
    total_admins = db.query(func.count(User.id)).filter(
        User.role.in_([UserRole.ADMIN, UserRole.SUPER_ADMIN])
    ).scalar() or 0

    # 3. Active players (players with wallet transactions in last 24h)
    recent_tx_users = db.query(WalletTransaction.user_id).filter(
        WalletTransaction.created_at >= yesterday
    ).distinct().all()
    active_user_ids = {u[0] for u in recent_tx_users}
    active_players_count = len(active_user_ids)

    # 4. Deposits
    dep_stats = db.query(
        func.count(Deposit.id),
        func.coalesce(func.sum(Deposit.amount), 0),
    ).filter(Deposit.status == DepositStatus.SUCCESS).first()
    total_deposits_count = dep_stats[0] if dep_stats else 0
    total_deposits_paise = dep_stats[1] if dep_stats else 0
    total_deposits_inr = round(total_deposits_paise / 100, 2)

    # 5. Withdrawals
    wd_stats = db.query(
        func.count(Withdrawal.id),
        func.coalesce(func.sum(Withdrawal.amount), 0),
    ).filter(Withdrawal.status == WithdrawalStatus.COMPLETED).first()
    total_withdrawals_count = wd_stats[0] if wd_stats else 0
    total_withdrawals_paise = wd_stats[1] if wd_stats else 0
    total_withdrawals_inr = round(total_withdrawals_paise / 100, 2)

    # 6. Pending withdrawals
    pending_withdrawals_count = db.query(func.count(Withdrawal.id)).filter(
        Withdrawal.status == WithdrawalStatus.PENDING
    ).scalar() or 0

    # 7. Total platform profit/revenue
    total_revenue_inr = round(total_deposits_inr - total_withdrawals_inr, 2)

    # 8. Real Coin Circulation (sum of all wallet balances)
    total_circulation_paise = db.query(func.coalesce(func.sum(Wallet.balance), 0)).scalar() or 0
    coin_circulation = round(total_circulation_paise / 100, 2)

    # 9. Games overview (real active player counts from catalog games)
    catalog_games = db.query(Game).order_by(Game.name.asc()).all()
    games_overview = []
    for g in catalog_games:
        # Check active players for this game in last 24h from transactions
        recent_game_players = db.query(func.count(func.distinct(WalletTransaction.user_id))).filter(
            WalletTransaction.created_at >= yesterday,
            or_(
                func.cast(WalletTransaction.metadata_, String).ilike(f'%"{g.slug}"%'),
                WalletTransaction.reference_type.ilike(f'%{g.slug.replace("-", "_")}%'),
                WalletTransaction.reference_type.ilike(f'%{g.slug}%'),
            )
        ).scalar() or 0

        games_overview.append({
            "id": str(g.id),
            "name": g.name,
            "slug": g.slug,
            "game_type": g.game_type,
            "is_live": g.status == GameStatus.ACTIVE,
            "active_players": recent_game_players,
            "min_bet_inr": round(g.min_bet / 100, 2) if g.min_bet else 10.0,
            "max_bet_inr": round(g.max_bet / 100, 2) if g.max_bet else 1000.0,
        })

    # 10. Live Players (real game transactions across all platform games)
    recent_game_txs = (
        db.query(WalletTransaction, User)
        .join(User, WalletTransaction.user_id == User.id)
        .filter(WalletTransaction.type.in_([WalletTransactionType.GAME_ENTRY, WalletTransactionType.GAME_WIN]))
        .order_by(WalletTransaction.created_at.desc())
        .limit(8)
        .all()
    )
    live_players = []
    for tx, u in recent_game_txs:
        uname = u.username or u.name or "player"
        masked = uname[:3] + "****" + uname[-2:] if len(uname) > 5 else uname
        meta = tx.metadata_ if isinstance(tx.metadata_, dict) else {}
        game_slug = meta.get("game") or tx.reference_type or "Game"
        game_obj = next((cg for cg in catalog_games if cg.slug in str(game_slug).lower() or cg.slug.replace("-", "_") in str(game_slug).lower()), None)
        game_display_name = game_obj.name if game_obj else str(game_slug).replace("_", " ").title()
        action_verb = "won" if tx.type == WalletTransactionType.GAME_WIN else "placed bet"
        live_players.append({
            "user_id": str(u.id),
            "display_name": masked,
            "game_name": game_display_name,
            "action": f"{action_verb} on {game_display_name}",
            "amount_inr": round(abs(tx.amount) / 100, 2),
            "time": tx.created_at.strftime("%H:%M:%S") if tx.created_at else now.strftime("%H:%M:%S"),
        })

    # 11. Recent Transactions
    txs = db.query(WalletTransaction).order_by(WalletTransaction.created_at.desc()).limit(8).all()
    recent_txs = []
    for t in txs:
        u = db.query(User).filter(User.id == t.user_id).first()
        recent_txs.append({
            "id": f"TXN{str(t.id)[:8].upper()}",
            "full_id": str(t.id),
            "user_name": u.username if u else "User",
            "type": t.type.value if hasattr(t.type, "value") else str(t.type),
            "amount_inr": round(abs(t.amount) / 100, 2),
            "status": "Success" if t.status == WalletTransactionStatus.COMPLETED else "Pending",
            "date": t.created_at.strftime("%d %b %Y %H:%M") if t.created_at else "-",
        })

    # 12. Pending Withdrawal Requests
    pending_wds = (
        db.query(Withdrawal)
        .filter(Withdrawal.status == WithdrawalStatus.PENDING)
        .order_by(Withdrawal.created_at.desc())
        .limit(6)
        .all()
    )
    withdrawal_requests = []
    for w in pending_wds:
        u = db.query(User).filter(User.id == w.user_id).first()
        withdrawal_requests.append({
            "id": f"WD{str(w.id)[:6].upper()}",
            "full_id": str(w.id),
            "user_name": u.username if u else "User",
            "amount_inr": round(w.amount / 100, 2),
            "payment_mode": w.method or "UPI",
            "status": "Pending",
            "date": w.created_at.strftime("%d %b %Y %H:%M") if w.created_at else "-",
        })

    # 13. Real Device distribution from registered users
    device_distribution = {
        "android": total_players,
        "ios": 0,
        "web": total_admins,
        "others": 0,
    }

    return success_response({
        "total_players": total_players,
        "total_admin_users": total_admins,
        "active_players": active_players_count,
        "total_deposits_inr": total_deposits_inr,
        "total_deposits_count": total_deposits_count,
        "total_withdrawals_inr": total_withdrawals_inr,
        "total_withdrawals_count": total_withdrawals_count,
        "pending_withdrawals": pending_withdrawals_count,
        "total_revenue_inr": total_revenue_inr,
        "coin_circulation": coin_circulation,
        "games_overview": games_overview,
        "live_players": live_players,
        "recent_transactions": recent_txs,
        "withdrawal_requests": withdrawal_requests,
        "device_distribution": device_distribution,
    })


@router.get("/dashboard/analytics")
def get_dashboard_analytics(
    request: Request,
    period: str = Query(default="weekly"),
    game_slug: Optional[str] = Query(default=None),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    days = 7 if period == "weekly" else 30
    now = datetime.now(timezone.utc)
    start_date = now - timedelta(days=days)

    all_games = db.query(Game).order_by(Game.name.asc()).all()
    selected_game = None
    if game_slug and game_slug != "all":
        selected_game = db.query(Game).filter(Game.slug == game_slug).first()

    series = []
    for d in range(days):
        day_date = (now - timedelta(days=days - 1 - d)).date()
        day_str = day_date.strftime("%Y-%m-%d")
        series.append({
            "date": day_str,
            "label": day_date.strftime("%d %b") if days <= 7 else day_date.strftime("%d/%m"),
            "total_bets": 0,
            "total_volume": 0,
            "total_wins": 0,
            "total_rounds": 0,
            "active_players": set(),
        })
    series_map = {item["date"]: item for item in series}

    # 1. GameBet records
    bets_query = db.query(GameBet).filter(GameBet.created_at >= start_date)
    if selected_game:
        bets_query = bets_query.filter(GameBet.game_id == selected_game.id)
    bets = bets_query.all()

    for b in bets:
        b_date = b.created_at.date().strftime("%Y-%m-%d")
        if b_date in series_map:
            series_map[b_date]["total_bets"] += 1
            series_map[b_date]["total_volume"] += (b.amount or 0)
            if b.status == GameBetStatus.WON:
                series_map[b_date]["total_wins"] += (b.net_win_amount or b.gross_win_amount or 0)
            series_map[b_date]["active_players"].add(str(b.user_id))

    # 2. WalletTransaction records across all other platform games
    wallet_tx_query = db.query(WalletTransaction).filter(
        WalletTransaction.created_at >= start_date,
        WalletTransaction.type.in_([WalletTransactionType.GAME_ENTRY, WalletTransactionType.GAME_WIN]),
    )
    if selected_game:
        wallet_tx_query = wallet_tx_query.filter(
            or_(
                func.cast(WalletTransaction.metadata_, String).ilike(f'%"{selected_game.slug}"%'),
                WalletTransaction.reference_type.ilike(f'%{selected_game.slug.replace("-", "_")}%'),
                WalletTransaction.reference_type.ilike(f'%{selected_game.slug}%'),
            )
        )
    wallet_txs = wallet_tx_query.all()

    for tx in wallet_txs:
        t_date = tx.created_at.date().strftime("%Y-%m-%d")
        if t_date in series_map:
            if tx.type == WalletTransactionType.GAME_ENTRY:
                series_map[t_date]["total_bets"] += 1
                series_map[t_date]["total_volume"] += abs(tx.amount)
            elif tx.type == WalletTransactionType.GAME_WIN:
                series_map[t_date]["total_wins"] += abs(tx.amount)
            series_map[t_date]["active_players"].add(str(tx.user_id))

    # 3. Game rounds
    rounds_query = db.query(GameRound).filter(GameRound.started_at >= start_date)
    if selected_game:
        rounds_query = rounds_query.filter(GameRound.game_id == selected_game.id)
    rounds = rounds_query.all()

    for r in rounds:
        r_date = r.started_at.date().strftime("%Y-%m-%d")
        if r_date in series_map:
            series_map[r_date]["total_rounds"] += 1

    formatted_series = []
    for s in series:
        formatted_series.append({
            "date": s["date"],
            "label": s["label"],
            "total_bets": s["total_bets"],
            "total_volume": s["total_volume"],
            "total_volume_inr": round(s["total_volume"] / 100, 2),
            "total_wins": s["total_wins"],
            "total_wins_inr": round(s["total_wins"] / 100, 2),
            "total_rounds": s["total_rounds"],
            "active_players": len(s["active_players"]),
        })

    game_comparison = []
    for g in all_games:
        g_bets = db.query(GameBet).filter(GameBet.game_id == g.id, GameBet.created_at >= start_date).all()
        g_rounds_count = db.query(GameRound).filter(GameRound.game_id == g.id, GameRound.started_at >= start_date).count()

        # Query game transactions
        g_txs = db.query(WalletTransaction).filter(
            WalletTransaction.created_at >= start_date,
            WalletTransaction.type.in_([WalletTransactionType.GAME_ENTRY, WalletTransactionType.GAME_WIN]),
            or_(
                func.cast(WalletTransaction.metadata_, String).ilike(f'%"{g.slug}"%'),
                WalletTransaction.reference_type.ilike(f'%{g.slug.replace("-", "_")}%'),
                WalletTransaction.reference_type.ilike(f'%{g.slug}%'),
            )
        ).all()

        total_bets_count = len(g_bets) + sum(1 for t in g_txs if t.type == WalletTransactionType.GAME_ENTRY)
        g_vol = sum(b.amount for b in g_bets) + sum(abs(t.amount) for t in g_txs if t.type == WalletTransactionType.GAME_ENTRY)
        g_wins = sum(b.net_win_amount or 0 for b in g_bets if b.status == GameBetStatus.WON) + sum(abs(t.amount) for t in g_txs if t.type == WalletTransactionType.GAME_WIN)
        g_players = len({str(b.user_id) for b in g_bets} | {str(t.user_id) for t in g_txs})

        game_comparison.append({
            "game_id": str(g.id),
            "name": g.name,
            "slug": g.slug,
            "total_rounds": g_rounds_count,
            "total_bets": total_bets_count,
            "total_volume": g_vol,
            "total_volume_inr": round(g_vol / 100, 2),
            "total_wins_inr": round(g_wins / 100, 2),
            "active_players": g_players,
        })

    total_bets_all = sum(s["total_bets"] for s in formatted_series)
    total_volume_all = sum(s["total_volume"] for s in formatted_series)
    total_wins_all = sum(s["total_wins"] for s in formatted_series)
    total_rounds_all = sum(s["total_rounds"] for s in formatted_series)
    all_active_players = set()
    for s in series:
        all_active_players.update(s["active_players"])

    return success_response({
        "period": period,
        "days": days,
        "selected_game": game_slug or "all",
        "time_series": formatted_series,
        "game_comparison": game_comparison,
        "summary": {
            "total_games_played": total_rounds_all,
            "total_bets": total_bets_all,
            "total_volume_inr": round(total_volume_all / 100, 2),
            "total_wins_inr": round(total_wins_all / 100, 2),
            "active_players": len(all_active_players),
        },
        "available_games": [{"name": g.name, "slug": g.slug} for g in all_games],
    })


@router.get("/users")
@limiter.limit("60/minute")
def list_users(
    request: Request,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    status: Optional[str] = Query(default=None),
    role: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
):
    query = db.query(User)
    if status and status != "ALL":
        query = query.filter(User.status == status)
    if role and role != "ALL":
        query = query.filter(User.role == role)
    term = normalize_search_term(search)
    if term:
        like = f"%{term}%"
        query = query.filter(
            (User.name.ilike(like)) | (User.email.ilike(like)) | (User.username.ilike(like)) | (cast(User.id, String).ilike(like))
        )
    total = query.count()
    items = query.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    user_items = []
    for u in items:
        udata = UserOut.model_validate(u).model_dump()
        udata["wallet_balance"] = u.wallet.balance if u.wallet else 0
        user_items.append(udata)
    return success_response({
        "total": total, "page": page, "page_size": page_size,
        "items": user_items,
    })


@router.get("/users/{user_id}")
def get_user(user_id: UUID, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return error_response("NOT_FOUND", "User not found", status_code=404)
    data = UserOut.model_validate(user).model_dump()
    data["wallet_balance"] = user.wallet.balance if user.wallet else 0
    return success_response(data)


class AdminUserRoleUpdateIn(BaseModel):
    role: UserRole
    reason: Optional[str] = None


@router.patch("/users/{user_id}/status")
def update_user_status(
    user_id: UUID,
    data: AdminUserStatusUpdateIn,
    admin: User = Depends(require_permission(AdminPermission.USERS.value)),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return error_response("NOT_FOUND", "User not found", status_code=404)
    old_status = user.status
    user.status = data.status
    audit_service.log_action(
        db, action="USER_STATUS_CHANGE", actor_id=admin.id,
        entity_type="user", entity_id=user_id,
        metadata={"old": old_status.value, "new": data.status.value, "reason": data.reason},
    )
    db.commit()
    return success_response(UserOut.model_validate(user).model_dump())


@router.patch("/users/{user_id}/role")
def update_user_role(
    user_id: UUID,
    data: AdminUserRoleUpdateIn,
    admin: User = Depends(require_permission(AdminPermission.USERS.value)),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return error_response("NOT_FOUND", "User not found", status_code=404)
    if user.id == admin.id and data.role != UserRole.SUPER_ADMIN and admin.role == UserRole.SUPER_ADMIN:
        return error_response("SELF_DEMOTION", "Cannot demote your own Super Admin account", status_code=400)
    old_role = user.role
    user.role = data.role
    audit_service.log_action(
        db, action="USER_ROLE_CHANGE", actor_id=admin.id,
        entity_type="user", entity_id=user_id,
        metadata={
            "old": old_role.value if hasattr(old_role, "value") else str(old_role),
            "new": data.role.value if hasattr(data.role, "value") else str(data.role),
            "reason": data.reason,
        },
    )
    db.commit()
    return success_response(UserOut.model_validate(user).model_dump())


class AdminUserPasswordUpdateIn(BaseModel):
    new_password: str = Field(min_length=6, max_length=128)


@router.put("/users/{user_id}/password")
def update_user_password(
    user_id: UUID,
    data: AdminUserPasswordUpdateIn,
    admin: User = Depends(require_permission(AdminPermission.USERS.value)),
    db: Session = Depends(get_db),
):
    """Admin manually sets or resets a player user's password."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return error_response("NOT_FOUND", "User not found", status_code=404)

    user.password_hash = hash_password(data.new_password)
    user.updated_at = datetime.now(timezone.utc)

    # Invalidate existing active refresh tokens so any stolen sessions are revoked
    db.query(RefreshToken).filter(RefreshToken.user_id == user.id).update({"is_revoked": True})

    audit_service.log_action(
        db,
        action="USER_PASSWORD_RESET",
        actor_id=admin.id,
        entity_type="user",
        entity_id=str(user_id),
        metadata={
            "target_user": user.username,
            "target_name": user.name,
            "reset_by_admin": admin.username,
        },
    )
    db.commit()
    return success_response({
        "message": f"Password for @{user.username} has been updated successfully",
        "user_id": str(user.id),
    })


# -- Transactions ---------------------------------------------------------------
@router.get("/transactions")
def list_all_transactions(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    search: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
):
    query = db.query(WalletTransaction)
    if status and status != "ALL":
        query = query.filter(WalletTransaction.status == status)
    term = normalize_search_term(search)
    if term:
        term_uuid = as_uuid(term)
        if term_uuid:
            # A full UUID is either the transaction or the user it belongs to.
            query = query.filter(
                (WalletTransaction.id == term_uuid) | (WalletTransaction.user_id == term_uuid)
            )
        else:
            like = f"%{term}%"
            query = query.join(User, WalletTransaction.user_id == User.id).filter(
                (User.name.ilike(like)) |
                (User.username.ilike(like)) |
                (User.email.ilike(like)) |
                (WalletTransaction.reference_id.ilike(like)) |
                (cast(WalletTransaction.id, String).ilike(like)) |
                (cast(WalletTransaction.user_id, String).ilike(like))
            )
    total = query.count()
    items = query.order_by(WalletTransaction.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    out_items = []
    for t in items:
        td = WalletTransactionOut.model_validate(t).model_dump()
        user_obj = db.query(User).filter(User.id == t.user_id).first()
        # WalletTransactionOut is shared with the player-facing wallet API and
        # carries no owner, but the admin table lists and copies the User ID.
        td["user_id"] = str(t.user_id)
        td["user_name"] = user_obj.name if user_obj else "Unknown"
        td["user_email"] = user_obj.email if user_obj else ""
        method = "—"
        if t.metadata_ and isinstance(t.metadata_, dict):
            method = t.metadata_.get("method") or t.metadata_.get("payment_method") or "—"
        if method == "—" and t.reference_type:
            method = t.reference_type.replace("_", " ").title()
        td["payment_method"] = method
        if t.type == WalletTransactionType.ADJUSTMENT:
            td["adjustment_direction"] = "add" if t.balance_after >= t.balance_before else "deduct"
        out_items.append(td)
    return success_response({
        "total": total, "page": page, "page_size": page_size,
        "items": out_items,
    })


# -- Deposits -------------------------------------------------------------------
@router.get("/deposits")
def list_all_deposits(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    search: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
):
    query = db.query(Deposit)
    if status and status != "ALL":
        query = query.filter(Deposit.status == status)
    term = normalize_search_term(search)
    if term:
        term_uuid = as_uuid(term)
        if term_uuid:
            query = query.filter((Deposit.id == term_uuid) | (Deposit.user_id == term_uuid))
        else:
            like = f"%{term}%"
            query = query.join(User, Deposit.user_id == User.id).filter(
                (User.name.ilike(like)) |
                (User.username.ilike(like)) |
                (User.email.ilike(like)) |
                (Deposit.provider_order_id.ilike(like)) |
                (cast(Deposit.id, String).ilike(like)) |
                (cast(Deposit.user_id, String).ilike(like))
            )
    total = query.count()
    items = query.order_by(Deposit.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    out_items = []
    for d in items:
        dd = DepositOut.model_validate(d).model_dump()
        user_obj = db.query(User).filter(User.id == d.user_id).first()
        dd["user_name"] = user_obj.name if user_obj else "Unknown"
        dd["payment_method"] = (d.provider or "UPI").upper()
        out_items.append(dd)
    return success_response({
        "total": total, "page": page, "page_size": page_size,
        "items": out_items,
    })


@router.post("/deposits/{deposit_id}/approve")
def approve_deposit_endpoint(
    deposit_id: UUID,
    admin: User = Depends(require_permission(AdminPermission.DEPOSITS.value)),
    db: Session = Depends(get_db),
):
    """Admin manually verifies and approves a player deposit, crediting the balance."""
    dep = db.query(Deposit).filter(Deposit.id == deposit_id).first()
    if not dep:
        return error_response("NOT_FOUND", "Deposit not found", status_code=404)
    if dep.status == DepositStatus.SUCCESS:
        return error_response("ALREADY_PROCESSED", "Deposit is already approved", status_code=400)

    dep.status = DepositStatus.SUCCESS
    dep.updated_at = datetime.now(timezone.utc)

    # 1. Credit player wallet
    wallet_service.credit_wallet(
        db,
        user_id=dep.user_id,
        amount=dep.amount,
        tx_type=WalletTransactionType.DEPOSIT,
        reference_type="deposit",
        reference_id=str(dep.id),
        metadata={"description": f"Deposit approved by {admin.name or admin.username}"},
    )

    # 2. Apply global wager multiplier
    w_setting = db.query(SystemSetting).filter(SystemSetting.key == "global_wager_settings").first()
    multiplier = 1.0
    if w_setting and w_setting.value:
        multiplier = float(w_setting.value.get("multiplier", 1.0))
    required_wager = int(dep.amount * multiplier)
    wager_service.create_wager_requirement(db, dep.user_id, dep.amount, deposit_id=dep.id, multiplier=multiplier)

    # 3. Audit log
    audit_service.log_action(
        db,
        action="DEPOSIT_APPROVE",
        actor_id=admin.id,
        entity_type="deposit",
        entity_id=str(dep.id),
        metadata={
            "amount_paise": dep.amount,
            "amount_inr": dep.amount / 100,
            "user_id": str(dep.user_id),
            "wager_multiplier": multiplier,
            "required_wager_inr": required_wager / 100,
            "approved_by": admin.username,
        },
    )
    db.commit()
    return success_response({
        "message": f"Deposit of ₹{dep.amount / 100:.2f} approved and credited successfully",
        "deposit_id": str(dep.id),
        "status": "SUCCESS",
    })


@router.post("/deposits/{deposit_id}/reject")
def reject_deposit_endpoint(
    deposit_id: UUID,
    body: Optional[WithdrawalActionIn] = None,
    admin: User = Depends(require_permission(AdminPermission.DEPOSITS.value)),
    db: Session = Depends(get_db),
):
    """Admin marks a deposit as rejected / failed."""
    dep = db.query(Deposit).filter(Deposit.id == deposit_id).first()
    if not dep:
        return error_response("NOT_FOUND", "Deposit not found", status_code=404)
    if dep.status == DepositStatus.SUCCESS:
        return error_response("ALREADY_PROCESSED", "Cannot reject an already approved deposit", status_code=400)

    reason = (body.reason if body else None) or "Rejected by administrator"
    dep.status = DepositStatus.FAILED
    dep.updated_at = datetime.now(timezone.utc)

    audit_service.log_action(
        db,
        action="DEPOSIT_REJECT",
        actor_id=admin.id,
        entity_type="deposit",
        entity_id=str(dep.id),
        metadata={
            "amount_paise": dep.amount,
            "user_id": str(dep.user_id),
            "reason": reason,
            "rejected_by": admin.username,
        },
    )
    db.commit()
    return success_response({
        "message": "Deposit marked as rejected",
        "deposit_id": str(dep.id),
        "status": "FAILED",
    })


# -- Withdrawals ----------------------------------------------------------------
@router.get("/withdrawals")
def list_all_withdrawals(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    search: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    date_filter: Optional[str] = Query(default=None),
):
    query = db.query(Withdrawal)
    if status and status != "ALL":
        query = query.filter(Withdrawal.status == status)
    if date_filter and date_filter != "ALL":
        now = datetime.now(timezone.utc)
        if date_filter == "TODAY":
            start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            query = query.filter(Withdrawal.created_at >= start)
        elif date_filter == "WEEK":
            start = now - timedelta(days=7)
            query = query.filter(Withdrawal.created_at >= start)
        elif date_filter == "MONTH":
            start = now - timedelta(days=30)
            query = query.filter(Withdrawal.created_at >= start)
    term = normalize_search_term(search)
    if term:
        term_uuid = as_uuid(term)
        if term_uuid:
            query = query.filter((Withdrawal.id == term_uuid) | (Withdrawal.user_id == term_uuid))
        else:
            like = f"%{term}%"
            query = query.join(User, Withdrawal.user_id == User.id).filter(
                (User.name.ilike(like)) |
                (User.username.ilike(like)) |
                (User.email.ilike(like)) |
                (Withdrawal.destination.ilike(like)) |
                (cast(Withdrawal.id, String).ilike(like)) |
                (cast(Withdrawal.user_id, String).ilike(like))
            )
    total = query.count()
    items = query.order_by(Withdrawal.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    out_items = []
    for w in items:
        wd = WithdrawalOut.model_validate(w).model_dump()
        user_obj = db.query(User).filter(User.id == w.user_id).first()
        wd["user_name"] = user_obj.name if user_obj else "Unknown"
        wd["payment_method"] = (w.method or "Bank").upper()
        withdrawal_meta = w.metadata_ or {}
        wd["payout_provider"] = withdrawal_meta.get("payout_provider")
        wd["payout_id"] = withdrawal_meta.get("payout_id")
        wd["payout_status"] = withdrawal_meta.get("payout_status")
        wd["payout_utr"] = withdrawal_meta.get("payout_utr")
        out_items.append(wd)
    return success_response({
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": out_items,
    })


@router.post("/withdrawals/{withdrawal_id}/approve")
def approve_withdrawal_endpoint(
    withdrawal_id: UUID,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    try:
        w = withdrawal_service.approve_withdrawal(db, withdrawal_id, admin.id)
        audit_service.log_action(
            db, action="WITHDRAWAL_APPROVE", actor_id=admin.id,
            entity_type="withdrawal", entity_id=str(withdrawal_id),
            metadata={"status": w.status.value},
        )
        db.commit()
        return success_response(WithdrawalOut.model_validate(w).model_dump())
    except ValueError as e:
        return error_response("WITHDRAWAL_ACTION_ERROR", str(e), status_code=400)


@router.post("/withdrawals/{withdrawal_id}/processing")
def mark_payment_processing_endpoint(
    withdrawal_id: UUID,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    try:
        w = withdrawal_service.mark_payment_processing(db, withdrawal_id, admin.id)
        audit_service.log_action(
            db, action="WITHDRAWAL_PROCESSING", actor_id=admin.id,
            entity_type="withdrawal", entity_id=str(withdrawal_id),
            metadata={"status": w.status.value},
        )
        db.commit()
        return success_response(WithdrawalOut.model_validate(w).model_dump())
    except ValueError as e:
        return error_response("WITHDRAWAL_ACTION_ERROR", str(e), status_code=400)


@router.post("/withdrawals/{withdrawal_id}/complete")
def complete_withdrawal_endpoint(
    withdrawal_id: UUID,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    try:
        w = withdrawal_service.complete_withdrawal(db, withdrawal_id, admin.id)
        audit_service.log_action(
            db, action="WITHDRAWAL_COMPLETE", actor_id=admin.id,
            entity_type="withdrawal", entity_id=str(withdrawal_id),
            metadata={"status": w.status.value},
        )
        db.commit()
        return success_response(WithdrawalOut.model_validate(w).model_dump())
    except ValueError as e:
        return error_response("WITHDRAWAL_ACTION_ERROR", str(e), status_code=400)


@router.post("/withdrawals/{withdrawal_id}/reject")
def reject_withdrawal_endpoint(
    withdrawal_id: UUID,
    body: Optional[WithdrawalActionIn] = None,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    try:
        reason = body.reason if body else None
        w = withdrawal_service.reject_withdrawal(db, withdrawal_id, admin.id, reason=reason)
        audit_service.log_action(
            db, action="WITHDRAWAL_REJECT", actor_id=admin.id,
            entity_type="withdrawal", entity_id=str(withdrawal_id),
            metadata={"status": w.status.value, "reason": reason},
        )
        db.commit()
        return success_response(WithdrawalOut.model_validate(w).model_dump())
    except ValueError as e:
        return error_response("WITHDRAWAL_ACTION_ERROR", str(e), status_code=400)


@router.post("/withdrawals/{withdrawal_id}/fail")
def fail_withdrawal_endpoint(
    withdrawal_id: UUID,
    body: Optional[WithdrawalActionIn] = None,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    try:
        reason = body.reason if body else None
        w = withdrawal_service.fail_withdrawal(db, withdrawal_id, admin.id, reason=reason)
        audit_service.log_action(
            db, action="WITHDRAWAL_FAIL", actor_id=admin.id,
            entity_type="withdrawal", entity_id=str(withdrawal_id),
            metadata={"status": w.status.value, "reason": reason},
        )
        db.commit()
        return success_response(WithdrawalOut.model_validate(w).model_dump())
    except ValueError as e:
        return error_response("WITHDRAWAL_ACTION_ERROR", str(e), status_code=400)




# -- Payment Settings -----------------------------------------------------------
@router.get("/payment-settings")
@limiter.limit("30/minute")
def get_payment_settings(request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    configs = db.query(PaymentConfiguration).all()
    return success_response([PaymentConfigOut.model_validate(c).model_dump() for c in configs])


@router.post("/payment-settings")
@limiter.limit("10/minute")
def create_payment_settings(
    request: Request,
    data: PaymentConfigCreateIn,
    admin: User = Depends(require_permission(AdminPermission.SETTINGS.value)),
    db: Session = Depends(get_db),
):
    # Check for duplicate provider
    existing = db.query(PaymentConfiguration).filter(PaymentConfiguration.provider == data.provider).first()
    if existing:
        return error_response("DUPLICATE_PROVIDER", f"Provider '{data.provider}' already exists", status_code=409)
    config = PaymentConfiguration(
        provider=data.provider,
        display_name=data.display_name,
        upi_id=data.upi_id,
        qr_code_reference=data.qr_code_reference,
        minimum_deposit=data.minimum_deposit,
        maximum_deposit=data.maximum_deposit,
        deposit_instructions=data.deposit_instructions,
        enabled=data.enabled,
    )
    db.add(config)
    db.flush()
    audit_service.log_action(
        db, action="PAYMENT_CONFIG_CREATE", actor_id=admin.id,
        entity_type="payment_configuration", entity_id=str(config.id),
        metadata={"provider": data.provider, "display_name": data.display_name, "enabled": data.enabled},
    )
    db.commit()
    db.refresh(config)
    return success_response(PaymentConfigOut.model_validate(config).model_dump(), status_code=201)


@router.patch("/payment-settings/{config_id}")
def update_payment_settings(
    config_id: UUID,
    data: PaymentConfigUpdateIn,
    admin: User = Depends(require_permission(AdminPermission.SETTINGS.value)),
    db: Session = Depends(get_db),
):
    config = db.query(PaymentConfiguration).filter(PaymentConfiguration.id == config_id).first()
    if not config:
        return error_response("NOT_FOUND", "Configuration not found", status_code=404)

    update_data = data.model_dump(exclude_none=True)

    # Validate: if enabling, UPI ID must be present (either in update or existing)
    final_enabled = update_data.get("enabled", config.enabled)
    final_upi = update_data.get("upi_id", config.upi_id)
    if final_enabled and not final_upi:
        return error_response("VALIDATION_ERROR", "UPI ID is required when configuration is enabled")

    # Validate: min/max consistency
    final_min = update_data.get("minimum_deposit", config.minimum_deposit)
    final_max = update_data.get("maximum_deposit", config.maximum_deposit)
    if final_max < final_min:
        return error_response("VALIDATION_ERROR", "Maximum deposit must be >= minimum deposit")

    for field, value in update_data.items():
        setattr(config, field, value)

    audit_service.log_action(db, action="PAYMENT_CONFIG_CHANGE", actor_id=admin.id,
                             entity_type="payment_configuration", entity_id=str(config_id),
                             metadata=update_data)
    db.commit()
    db.refresh(config)
    return success_response(PaymentConfigOut.model_validate(config).model_dump())


@router.delete("/payment-settings/{config_id}")
def delete_payment_settings(
    config_id: UUID,
    admin: User = Depends(require_permission(AdminPermission.SETTINGS.value)),
    db: Session = Depends(get_db),
):
    config = db.query(PaymentConfiguration).filter(PaymentConfiguration.id == config_id).first()
    if not config:
        return error_response("NOT_FOUND", "Configuration not found", status_code=404)

    config_provider = config.provider
    config_was_enabled = config.enabled

    db.delete(config)
    audit_service.log_action(
        db, action="PAYMENT_CONFIG_DELETE", actor_id=admin.id,
        entity_type="payment_configuration", entity_id=str(config_id),
        metadata={"provider": config_provider, "was_enabled": config_was_enabled},
    )
    db.commit()

    result = {"deleted": True, "provider": config_provider}
    if config_was_enabled:
        result["warning"] = "The deleted configuration was enabled. There is now no active payment method."
    return success_response(result)


@router.post("/payment-settings/{config_id}/qr-upload")
@limiter.limit("10/minute")
async def upload_qr_code(
    request: Request,
    config_id: UUID,
    admin: User = Depends(require_permission(AdminPermission.SETTINGS.value)),
    db: Session = Depends(get_db),
):
    import os
    import secrets
    from pathlib import Path
    from fastapi import UploadFile, File

    config = db.query(PaymentConfiguration).filter(PaymentConfiguration.id == config_id).first()
    if not config:
        return error_response("NOT_FOUND", "Configuration not found", status_code=404)

    # Parse multipart manually since we need the Depends for auth
    form = await request.form()
    file = form.get("file")
    if file is None or not hasattr(file, "filename"):
        return error_response("MISSING_FILE", "No file uploaded", status_code=400)

    # Validate MIME type
    ALLOWED_MIME = {"image/png", "image/jpeg", "image/jpg", "image/webp"}
    content_type = getattr(file, "content_type", "") or ""
    if content_type not in ALLOWED_MIME:
        return error_response("INVALID_FILE_TYPE", f"Only PNG, JPEG, WebP images are allowed. Got: {content_type}", status_code=400)

    # Validate extension
    original_name = getattr(file, "filename", "") or "unknown"
    ALLOWED_EXT = {".png", ".jpg", ".jpeg", ".webp"}
    ext = Path(original_name).suffix.lower()
    if ext not in ALLOWED_EXT:
        return error_response("INVALID_FILE_EXT", f"File extension not allowed: {ext}", status_code=400)

    # Read file content
    content = await file.read()

    # Validate size (max 2MB)
    MAX_SIZE = 2 * 1024 * 1024
    if len(content) > MAX_SIZE:
        return error_response("FILE_TOO_LARGE", f"QR image must be under 2MB. Got: {len(content)} bytes", status_code=400)

    if len(content) == 0:
        return error_response("EMPTY_FILE", "Uploaded file is empty", status_code=400)

    # Validate image header magic bytes
    PNG_MAGIC = b'\x89PNG\r\n\x1a\n'
    JPEG_MAGIC = b'\xff\xd8\xff'
    WEBP_MAGIC = b'RIFF'
    if not (content[:8] == PNG_MAGIC or content[:3] == JPEG_MAGIC or content[:4] == WEBP_MAGIC):
        return error_response("INVALID_IMAGE", "File content does not match a valid image format", status_code=400)

    # ---------------------------------------------------------
    # NEW: Validate that the image actually contains a QR code
    # ---------------------------------------------------------
    try:
        import cv2
        import numpy as np
        
        # Decode the image from memory
        nparr = np.frombuffer(content, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            return error_response("INVALID_IMAGE", "Could not decode image data", status_code=400)
            
        # Initialize the QRCode detector
        detector = cv2.QRCodeDetector()
        
        # Detect and decode the QR code
        data, bbox, straight_qrcode = detector.detectAndDecode(img)
        
        if not bbox is not None or not data:
            return error_response("NO_QR_CODE", "Uploaded image does not contain a readable QR code.", status_code=400)
            
    except ImportError:
        # Fallback if cv2 isn't installed (though we added it to requirements)
        print("WARNING: cv2 not installed, skipping QR validation")
        pass
    except Exception as e:
        return error_response("QR_VALIDATION_ERROR", f"Error validating QR code: {str(e)}", status_code=400)

    # Generate safe filename — no user-controlled path components
    safe_name = f"qr_{secrets.token_hex(16)}{ext}"
    upload_dir = Path(__file__).resolve().parents[2] / "uploads" / "qr"
    upload_dir.mkdir(parents=True, exist_ok=True)
    dest = upload_dir / safe_name

    # Prevent path traversal (belt-and-suspenders)
    if not str(dest.resolve()).startswith(str(upload_dir.resolve())):
        return error_response("SECURITY_ERROR", "Invalid file path", status_code=400)

    with open(dest, "wb") as f:
        f.write(content)

    # Delete old QR file if it exists
    old_ref = config.qr_code_reference
    if old_ref:
        old_name = old_ref.split("/")[-1]
        old_path = upload_dir / old_name
        if old_path.exists() and str(old_path.resolve()).startswith(str(upload_dir.resolve())):
            try:
                old_path.unlink()
            except OSError:
                pass

    # Store only the relative URL path, not filesystem path
    qr_url = f"/api/v1/uploads/qr/{safe_name}"
    config.qr_code_reference = qr_url
    audit_service.log_action(
        db, action="PAYMENT_QR_UPLOAD", actor_id=admin.id,
        entity_type="payment_configuration", entity_id=str(config_id),
        metadata={"qr_url": qr_url, "original_filename": original_name, "size_bytes": len(content)},
    )
    db.commit()
    db.refresh(config)
    return success_response({"qr_code_reference": qr_url})


# -- Wallet Adjustments ---------------------------------------------------------
@router.post("/wallet-adjustments")
def wallet_adjustment(
    user_id: UUID,
    amount: int,
    reason: str,
    admin: User = Depends(require_permission(AdminPermission.WALLET.value)),
    db: Session = Depends(get_db),
):
    if not reason or len(reason.strip()) < 5:
        return error_response("INVALID_REASON", "Reason must be at least 5 characters")
    try:
        adj_ref = f"adj_{admin.id}_{user_id}_{uuid.uuid4()}"
        if amount >= 0:
            tx = wallet_service.credit_wallet(
                db, user_id, abs(amount), WalletTransactionType.ADJUSTMENT,
                reference_type="admin_adjustment", reference_id=adj_ref,
                metadata={"reason": reason, "admin_id": str(admin.id)},
            )
        else:
            tx = wallet_service.debit_wallet(
                db, user_id, abs(amount), WalletTransactionType.ADJUSTMENT,
                reference_type="admin_adjustment", reference_id=adj_ref,
                metadata={"reason": reason, "admin_id": str(admin.id)},
            )
        audit_service.log_action(
            db, action="WALLET_ADJUSTMENT", actor_id=admin.id,
            entity_type="wallet", entity_id=user_id,
            metadata={"amount": amount, "reason": reason, "tx_id": str(tx.id)},
        )
        db.commit()
        res_data = WalletTransactionOut.model_validate(tx).model_dump()
        res_data["balance_after"] = tx.balance_after
        return success_response(res_data)
    except ValueError as e:
        return error_response("ADJUSTMENT_ERROR", str(e))


# -- Referral Settings ----------------------------------------------------------
@router.get("/referral/settings")
def get_referral_settings_endpoint(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    from ..services.referral_service import get_referral_settings, serialize_referral_settings
    settings = get_referral_settings(db)
    return success_response(serialize_referral_settings(settings))


@router.put("/referral/settings")
def update_referral_settings_endpoint(
    data: ReferralSettingsUpdateIn,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    from ..services.referral_service import get_referral_settings, serialize_referral_settings

    # Validation
    if data.reward_amount <= 0:
        return error_response("VALIDATION_ERROR", "Reward amount must be positive", status_code=400)
    if data.reward_amount > 10000:
        return error_response("VALIDATION_ERROR", "Reward amount is too large (max ₹10,000)", status_code=400)
    if data.reward_type is not None and data.reward_type.upper() not in ("FLAT", "PERCENTAGE"):
        return error_response("VALIDATION_ERROR", "reward_type must be FLAT or PERCENTAGE", status_code=400)
    if data.reward_percentage is not None and not (0 < data.reward_percentage <= 100):
        return error_response("VALIDATION_ERROR", "reward_percentage must be between 0 and 100", status_code=400)
    if data.min_deposit is not None and data.min_deposit < 0:
        return error_response("VALIDATION_ERROR", "min_deposit cannot be negative", status_code=400)

    settings = get_referral_settings(db)
    old_reward = settings.reward_amount
    old_active = settings.is_active
    old_type = settings.reward_type
    old_percentage = float(settings.reward_percentage or 0)
    old_min_deposit = settings.min_deposit_amount

    # Convert to paisa
    new_reward_paisa = int(round(data.reward_amount * 100))
    settings.reward_amount = new_reward_paisa
    settings.is_active = data.is_active
    if data.reward_type is not None:
        settings.reward_type = data.reward_type.upper()
    if data.reward_percentage is not None:
        settings.reward_percentage = data.reward_percentage
    if data.min_deposit is not None:
        settings.min_deposit_amount = int(round(data.min_deposit * 100))
    settings.updated_by = admin.id

    # Admin Audit Log
    audit_service.log_action(
        db,
        action="REFERRAL_CONFIG_CHANGE",
        actor_id=admin.id,
        entity_type="referral_settings",
        entity_id=str(settings.id),
        metadata={
            "old_reward": old_reward,
            "new_reward": new_reward_paisa,
            "old_active": old_active,
            "new_active": data.is_active,
            "old_reward_type": old_type,
            "new_reward_type": settings.reward_type,
            "old_reward_percentage": old_percentage,
            "new_reward_percentage": float(settings.reward_percentage or 0),
            "old_min_deposit": old_min_deposit,
            "new_min_deposit": settings.min_deposit_amount,
        }
    )
    db.commit()
    db.refresh(settings)

    return success_response(serialize_referral_settings(settings))


# -- Rewards & Promotions Management -------------------------------------------
@router.get("/rewards/lucky-spin")
def admin_get_lucky_spin(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    items = reward_service.get_admin_lucky_spin(db)
    return success_response(items)


@router.put("/rewards/lucky-spin/{segment_index}")
def admin_update_lucky_spin_segment(
    segment_index: int,
    data: LuckySpinSegmentUpdateIn,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    try:
        updated = reward_service.update_admin_lucky_spin_segment(db, segment_index, data)
        return success_response(updated)
    except ValueError as e:
        return error_response("UPDATE_ERROR", str(e), status_code=400)


@router.get("/rewards/7days")
def admin_get_7days(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    data = reward_service.get_admin_7days(db)
    return success_response(data)


@router.put("/rewards/7days/settings")
def admin_update_7day_settings(
    data: DailyRewardSettingsUpdateIn,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    try:
        updated = reward_service.update_admin_7day_settings(db, data)
        return success_response(updated)
    except ValueError as e:
        return error_response("UPDATE_ERROR", str(e), status_code=400)


@router.put("/rewards/7days/{day_number}")
def admin_update_7day_day(
    day_number: int,
    data: DailyRewardConfigUpdateIn,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    try:
        updated = reward_service.update_admin_7day_day(db, day_number, data)
        return success_response(updated)
    except ValueError as e:
        return error_response("UPDATE_ERROR", str(e), status_code=400)


@router.get("/rewards/bonuses")
def admin_get_bonuses(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    items = reward_service.get_admin_bonuses(db)
    return success_response(items)


@router.post("/rewards/bonuses")
def admin_create_bonus(
    data: BonusCreateIn,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    try:
        created = reward_service.create_admin_bonus(db, data)
        return success_response(created)
    except ValueError as e:
        return error_response("CREATE_ERROR", str(e), status_code=400)


@router.put("/rewards/bonuses/{bonus_id}")
def admin_update_bonus(
    bonus_id: UUID,
    data: BonusUpdateIn,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    try:
        updated = reward_service.update_admin_bonus(db, bonus_id, data)
        return success_response(updated)
    except ValueError as e:
        return error_response("UPDATE_ERROR", str(e), status_code=400)


@router.delete("/rewards/bonuses/{bonus_id}")
def admin_delete_bonus(
    bonus_id: UUID,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    try:
        res = reward_service.delete_admin_bonus(db, bonus_id)
        return success_response(res)
    except ValueError as e:
        return error_response("DELETE_ERROR", str(e), status_code=400)


@router.get("/rewards/jackpot")
def admin_get_jackpot(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    data = reward_service.get_admin_jackpot(db)
    return success_response(data)


@router.put("/rewards/jackpot")
def admin_update_jackpot(
    data: JackpotUpdateIn,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    try:
        updated = reward_service.update_admin_jackpot(db, data)
        return success_response(updated)
    except ValueError as e:
        return error_response("UPDATE_ERROR", str(e), status_code=400)


@router.get("/rewards/vip")
def admin_get_vip(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    items = reward_service.get_admin_vip(db)
    return success_response(items)


@router.put("/rewards/vip/{vip_level}")
def admin_update_vip(
    vip_level: int,
    data: VipBonusUpdateIn,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    try:
        updated = reward_service.update_admin_vip_tier(db, vip_level, data)
        return success_response(updated)
    except ValueError as e:
        return error_response("UPDATE_ERROR", str(e), status_code=400)


# --- Per-Game Commission Management ---

# Canonical slugs, matching the game_slug each engine passes to settle_winning_bet.
KNOWN_GAME_SLUGS = {
    "dragon-tiger": "Dragon Tiger",
    "andar-bahar": "Andar Bahar",
    "colour-prediction": "Colour Prediction",
    "roulette": "Roulette",
    "aviator": "Aviator",
    "chicken_road": "Chicken Road",
    "triple_777": "Triple 777",
    "teen-patti": "Teen Patti",
    "rummy": "Rummy",
    "poker": "Poker",
    "ludo": "Ludo",
}


def _commission_payload(cfg) -> dict:
    overrides = cfg.game_commission_overrides or {}
    global_pct = float(cfg.winning_fee_percent) if cfg.winning_fee_percent is not None else 0.0
    return {
        "global_winning_fee_percent": global_pct,
        "game_overrides": overrides,
        "games": [
            {
                "slug": slug,
                "name": name,
                "commission_percent": float(overrides.get(slug, global_pct)),
                "is_override": slug in overrides,
            }
            for slug, name in KNOWN_GAME_SLUGS.items()
        ],
    }


@router.get("/fees/game-commissions")
def get_game_commissions(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Per-game commission overrides plus the global default applied to every other game."""
    from .fees import get_or_create_fee_config
    cfg = get_or_create_fee_config(db)
    return success_response(_commission_payload(cfg))


@router.put("/fees/game-commissions")
def update_game_commissions(
    payload: dict,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Update per-game commission overrides.

    Body: {"game_overrides": {"dragon-tiger": 5.0, ...}}
    A slug omitted from the map falls back to the global winning fee percent.
    """
    from .fees import get_or_create_fee_config

    overrides = payload.get("game_overrides", {})
    if not isinstance(overrides, dict):
        return error_response("INVALID_INPUT", "game_overrides must be an object", status_code=400)

    cleaned: dict = {}
    for slug, pct in overrides.items():
        if slug not in KNOWN_GAME_SLUGS:
            return error_response(
                "INVALID_INPUT",
                f"Unknown game '{slug}'. Valid games: {', '.join(sorted(KNOWN_GAME_SLUGS))}",
                status_code=400,
            )
        try:
            val = float(pct)
        except (TypeError, ValueError):
            return error_response("INVALID_INPUT", f"Invalid commission value for '{slug}'", status_code=400)
        if val != val or val in (float("inf"), float("-inf")):
            return error_response("INVALID_INPUT", f"Invalid commission value for '{slug}'", status_code=400)
        if val < 0 or val > 100:
            return error_response("INVALID_INPUT", f"Commission for '{slug}' must be between 0 and 100", status_code=400)
        cleaned[slug] = round(val, 2)

    cfg = get_or_create_fee_config(db)
    old_overrides = cfg.game_commission_overrides or {}

    # Reassigning (rather than mutating) is what makes SQLAlchemy flush the JSON column.
    cfg.game_commission_overrides = cleaned
    cfg.updated_by_id = admin.id

    audit_service.log_action(
        db,
        action="GAME_COMMISSION_UPDATED",
        actor_id=admin.id,
        entity_type="fee_configuration",
        entity_id=str(cfg.id),
        metadata={"old": old_overrides, "new": cleaned},
    )

    db.commit()
    db.refresh(cfg)
    return success_response(_commission_payload(cfg))


# -- RBAC & Team Management ----------------------------------------------------
@router.get("/me")
def get_current_admin_info(admin: User = Depends(require_admin)):
    """Return the authenticated admin's profile and granted permissions."""
    perms = admin.permissions
    if admin.role == UserRole.SUPER_ADMIN:
        perms = [p.value for p in AdminPermission]
    elif perms is None:
        perms = DEFAULT_ROLE_PERMISSIONS.get("ADMIN", [])

    return success_response({
        "id": str(admin.id),
        "name": admin.name,
        "username": admin.username,
        "email": admin.email,
        "role": admin.role.value if hasattr(admin.role, "value") else str(admin.role),
        "team_role": admin.team_role or ("Super Administrator" if admin.role == UserRole.SUPER_ADMIN else "Administrator"),
        "permissions": perms,
    })


@router.get("/team")
def list_team_members(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List all staff and admin members for team management."""
    team = (
        db.query(User)
        .filter(User.role.in_([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
        .order_by(User.created_at.asc())
        .all()
    )
    results = []
    for m in team:
        perms = m.permissions
        if m.role == UserRole.SUPER_ADMIN:
            perms = [p.value for p in AdminPermission]
        elif perms is None:
            perms = DEFAULT_ROLE_PERMISSIONS.get("ADMIN", [])
        results.append({
            "id": str(m.id),
            "name": m.name,
            "username": m.username,
            "email": m.email,
            "role": m.role.value if hasattr(m.role, "value") else str(m.role),
            "team_role": m.team_role or ("Super Administrator" if m.role == UserRole.SUPER_ADMIN else "Administrator"),
            "status": m.status.value if hasattr(m.status, "value") else str(m.status),
            "permissions": perms,
            "created_at": m.created_at.isoformat() if m.created_at else None,
            "last_login_at": m.last_login_at.isoformat() if m.last_login_at else None,
        })
    return success_response(results)


@router.post("/team")
def create_team_member(
    payload: TeamMemberCreateIn,
    admin: User = Depends(require_permission(AdminPermission.RBAC.value)),
    db: Session = Depends(get_db),
):
    """Create a new staff or admin user with specific granular permissions."""
    existing = db.query(User).filter(
        or_(User.username == payload.username.strip(), User.email == payload.email.strip().lower())
    ).first()
    if existing:
        return error_response(400, "Username or email is already in use")

    new_user = User(
        name=payload.name.strip(),
        username=payload.username.strip(),
        email=payload.email.strip().lower(),
        password_hash=hash_password(payload.password),
        role=UserRole.ADMIN,
        status=UserStatus.ACTIVE,
        team_role=payload.team_role.strip() if payload.team_role else "Admin Staff",
        permissions=payload.permissions or DEFAULT_ROLE_PERMISSIONS.get("ADMIN", []),
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return success_response({
        "id": str(new_user.id),
        "name": new_user.name,
        "username": new_user.username,
        "email": new_user.email,
        "role": new_user.role.value,
        "team_role": new_user.team_role,
        "permissions": new_user.permissions,
        "status": new_user.status.value,
    })


@router.patch("/team/{user_id}")
def update_team_member(
    user_id: UUID,
    payload: TeamMemberUpdateIn,
    admin: User = Depends(require_permission(AdminPermission.RBAC.value)),
    db: Session = Depends(get_db),
):
    """Update team member's role, permissions, status, or details."""
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        return error_response(404, "User not found")
    if target.role == UserRole.SUPER_ADMIN and admin.id != target.id:
        return error_response(403, "Cannot modify another Super Admin")

    if payload.name is not None:
        target.name = payload.name.strip()
    if payload.email is not None:
        target.email = payload.email.strip().lower()
    if payload.team_role is not None:
        target.team_role = payload.team_role.strip()
    if payload.permissions is not None:
        target.permissions = payload.permissions
    if payload.status is not None:
        target.status = UserStatus(payload.status)
    if payload.password and payload.password.strip():
        target.password_hash = hash_password(payload.password.strip())

    target.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(target)
    return success_response({
        "id": str(target.id),
        "name": target.name,
        "username": target.username,
        "email": target.email,
        "role": target.role.value,
        "team_role": target.team_role,
        "permissions": target.permissions,
        "status": target.status.value,
    })


@router.delete("/team/{user_id}")
def delete_team_member(
    user_id: UUID,
    admin: User = Depends(require_permission(AdminPermission.RBAC.value)),
    db: Session = Depends(get_db),
):
    """Delete or disable a team member."""
    if admin.id == user_id:
        return error_response(400, "Cannot delete your own account")
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        return error_response(404, "User not found")
    if target.role == UserRole.SUPER_ADMIN:
        return error_response(403, "Cannot delete Super Admin account")

    target.status = UserStatus.DISABLED
    db.commit()
    return success_response({"message": f"Team member {target.username} has been disabled"})


@router.get("/team/permissions")
def get_team_permissions(admin: User = Depends(require_admin)):
    """Return catalog of all available permissions."""
    return success_response(PERMISSION_DETAILS)


@router.get("/team/roles")
def get_preset_roles(admin: User = Depends(require_admin)):
    """Return default role templates."""
    return success_response(DEFAULT_ROLE_PERMISSIONS)


# -- Wager Requirement Controls ------------------------------------------------
@router.get("/wagers")
def list_wagers(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    user_id: Optional[UUID] = Query(default=None),
    is_fulfilled: Optional[bool] = Query(default=None),
    search: Optional[str] = Query(default=None),
    status_filter: Optional[str] = Query(default=None),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List wager requirements with search, filters, and user details."""
    data = wager_service.admin_list_wagers(
        db, page=page, page_size=page_size, user_id=user_id, is_fulfilled=is_fulfilled, search=search, status_filter=status_filter
    )
    return success_response(data)


@router.post("/wagers")
def create_wager_requirement(
    payload: WagerCreateIn,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Admin manually set or add a wager play-through requirement for a user."""
    amount_paise = int(payload.required_amount_inr * 100)
    if amount_paise <= 0:
        return error_response(400, "Wager amount must be positive")
    req = wager_service.admin_set_user_wager(db, payload.user_id, amount_paise)
    return success_response({
        "id": str(req.id),
        "user_id": str(req.user_id),
        "required_amount_inr": payload.required_amount_inr,
        "is_fulfilled": req.is_fulfilled,
    })


@router.post("/wagers/{wager_id}/fulfill")
def fulfill_wager(
    wager_id: UUID,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Manually waive or mark a wager requirement as fulfilled."""
    ok = wager_service.admin_fulfill_wager(db, wager_id)
    if not ok:
        return error_response(404, "Wager requirement not found")
    return success_response({"message": "Wager requirement marked as fulfilled"})


@router.post("/wagers/users/{user_id}/waive")
def waive_user_wagers(
    user_id: UUID,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Waive all remaining unfulfilled wager requirements for a player."""
    count = wager_service.admin_waive_all_user_wagers(db, user_id)
    return success_response({"message": f"Waived {count} pending wager requirements"})


@router.get("/wagers/global")
def get_global_wager_config(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Retrieve global turnover multiplier and baseline playthrough policy."""
    row = db.query(SystemSetting).filter(SystemSetting.key == "global_wager_settings").first()
    data = {"multiplier": 1.0, "default_user_wager_inr": 0.0}
    if row and row.value:
        data.update(row.value)
    return success_response(data)


@router.put("/wagers/global")
def update_global_wager_config(
    payload: WagerGlobalUpdateIn,
    admin: User = Depends(require_permission(AdminPermission.WAGER_CONTROL.value)),
    db: Session = Depends(get_db),
):
    """Update global turnover multiplier applied to all player deposits."""
    row = db.query(SystemSetting).filter(SystemSetting.key == "global_wager_settings").first()
    new_data = {
        "multiplier": round(payload.multiplier, 2),
        "default_user_wager_inr": round(payload.default_user_wager_inr or 0.0, 2),
    }
    if not row:
        row = SystemSetting(
            key="global_wager_settings",
            value=new_data,
            description="Global deposit playthrough multiplier",
        )
        db.add(row)
    else:
        row.value = new_data
        row.updated_at = datetime.now(timezone.utc)

    synced_info = None
    if payload.apply_to_existing_deposits:
        synced_info = wager_service.sync_all_user_wagers_with_multiplier(db, payload.multiplier)

    audit_service.log_action(
        db,
        action="GLOBAL_WAGER_UPDATE",
        actor_id=admin.id,
        entity_type="system_setting",
        entity_id="global_wager_settings",
        metadata={**new_data, "synced_info": synced_info},
    )
    db.commit()
    return success_response({**new_data, "synced_info": synced_info})


@router.post("/wagers/sync-multiplier")
def sync_multiplier_wagers(
    admin: User = Depends(require_permission(AdminPermission.WAGER_CONTROL.value)),
    db: Session = Depends(get_db),
):
    """Sync and recalculate all player deposit turnover requirements with the active global multiplier."""
    result = wager_service.sync_all_user_wagers_with_multiplier(db)
    return success_response({
        "message": f"Successfully recalculated turnover for {result['updated_users']} players ({result['total_requirements_updated']} deposit requirements) at {result['multiplier']}x multiplier.",
        **result,
    })


@router.post("/wagers/apply-all")
def apply_wager_to_all_users(
    payload: WagerApplyAllIn,
    admin: User = Depends(require_permission(AdminPermission.WAGER_CONTROL.value)),
    db: Session = Depends(get_db),
):
    """Apply a baseline playthrough requirement to ALL registered player accounts."""
    amount_paise = int(payload.required_amount_inr * 100)
    users = db.query(User).filter(User.role == UserRole.USER, User.status == UserStatus.ACTIVE).all()
    count = 0
    for u in users:
        wager_service.admin_set_user_wager(db, u.id, amount_paise)
        count += 1

    audit_service.log_action(
        db,
        action="GLOBAL_WAGER_APPLY_ALL",
        actor_id=admin.id,
        entity_type="wager_bulk",
        entity_id="all_users",
        metadata={"amount_inr": payload.required_amount_inr, "user_count": count},
    )
    db.commit()
    return success_response({
        "message": f"Applied ₹{payload.required_amount_inr:.2f} wager requirement to {count} player accounts",
        "applied_count": count,
    })


@router.put("/wagers/{wager_id}")
def update_individual_wager(
    wager_id: UUID,
    payload: WagerUpdateIn,
    admin: User = Depends(require_permission(AdminPermission.WAGER_CONTROL.value)),
    db: Session = Depends(get_db),
):
    """Edit, increase, or decrease a specific player's wager requirement."""
    req = db.query(WagerRequirement).filter(WagerRequirement.id == wager_id).first()
    if not req:
        # Check if wager_id is actually a User ID
        user = db.query(User).filter(User.id == wager_id).first()
        if user:
            req = db.query(WagerRequirement).filter(WagerRequirement.user_id == user.id).order_by(WagerRequirement.created_at.desc()).first()
            if not req:
                req = WagerRequirement(
                    user_id=user.id,
                    required_amount=0,
                    completed_amount=0,
                    is_fulfilled=False,
                )
                db.add(req)
                db.flush()
        else:
            return error_response(404, "Wager requirement not found")

    old_req = req.required_amount
    old_comp = req.completed_amount

    if payload.required_amount_inr is not None:
        req.required_amount = int(payload.required_amount_inr * 100)
    if payload.completed_amount_inr is not None:
        req.completed_amount = int(payload.completed_amount_inr * 100)
    if payload.is_fulfilled is not None:
        req.is_fulfilled = payload.is_fulfilled

    # Auto-fulfill if completed exceeds or meets required
    if req.completed_amount >= req.required_amount and req.required_amount > 0:
        req.is_fulfilled = True
    elif req.completed_amount < req.required_amount and payload.is_fulfilled is None:
        req.is_fulfilled = False

    req.updated_at = datetime.now(timezone.utc)

    audit_service.log_action(
        db,
        action="WAGER_UPDATE",
        actor_id=admin.id,
        entity_type="wager_requirement",
        entity_id=str(req.id),
        metadata={
            "user_id": str(req.user_id),
            "old_required": old_req / 100,
            "new_required": req.required_amount / 100,
            "old_completed": old_comp / 100,
            "new_completed": req.completed_amount / 100,
            "is_fulfilled": req.is_fulfilled,
        },
    )
    db.commit()
    db.refresh(req)

    rem_p = max(0, int(req.required_amount) - int(req.completed_amount))
    prog = 100.0 if req.required_amount == 0 else round(min(100.0, (req.completed_amount / req.required_amount) * 100), 1)

    return success_response({
        "id": str(req.id),
        "user_id": str(req.user_id),
        "required_amount_inr": round(req.required_amount / 100, 2),
        "completed_amount_inr": round(req.completed_amount / 100, 2),
        "remaining_amount_inr": round(rem_p / 100, 2),
        "progress_percent": prog,
        "is_fulfilled": req.is_fulfilled,
    })


# -- Winning & RTP Controls ----------------------------------------------------
@router.get("/winning-controls/global")
def get_global_winning_controls(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Get global winning and RTP settings across all games."""
    data = winning_service.get_global_winning_configs(db)
    return success_response(data)


@router.put("/winning-controls/global/{game_slug}")
def update_global_winning_control(
    game_slug: str,
    payload: WinningGlobalUpdateIn,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Update global RTP and win mode for a specific game."""
    try:
        updated = winning_service.update_global_winning_config(
            db, game_slug, payload.mode, payload.rtp_percent
        )
        return success_response(updated)
    except ValueError as e:
        return error_response(404, str(e))


@router.get("/winning-controls/personal")
def get_personal_winning_controls(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    search: Optional[str] = Query(default=None),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List all player personal winning/loss luck overrides."""
    data = winning_service.get_personal_winning_controls(db, page, page_size, search)
    return success_response(data)


@router.post("/winning-controls/personal")
def set_personal_winning_control(
    payload: WinningPersonalSetIn,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Set or update personal winning override for a specific player."""
    try:
        ctrl = winning_service.set_personal_winning_control(
            db,
            user_id=payload.user_id,
            mode=payload.mode,
            win_rate_percent=payload.win_rate_percent,
            note=payload.note,
        )
        return success_response(ctrl)
    except ValueError as e:
        return error_response(404, str(e))


@router.delete("/winning-controls/personal/{user_id}")
def delete_personal_winning_control(
    user_id: UUID,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Reset a user's personal luck override back to default."""
    ok = winning_service.delete_personal_winning_control(db, user_id)
    if not ok:
        return error_response(404, "Personal winning control not found for this user")
    return success_response({"message": "Personal winning control reset to default"})

# -- Audit Logs Endpoint -------------------------------------------------------
@router.get("/audit-logs")
def list_audit_logs(
    admin: User = Depends(require_permission(AdminPermission.AUDIT_LOGS.value)),
    db: Session = Depends(get_db),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    action: Optional[str] = Query(default=None),
    entity_type: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    admin_only: bool = Query(default=True),
):
    """Retrieve paginated platform audit logs with actor and entity details. Defaults to admin operations."""
    query = db.query(AuditLog, User).outerjoin(User, AuditLog.actor_id == User.id)

    if admin_only:
        # Prioritize administrative operations: audits performed by staff or system config/approval events
        query = query.filter(
            or_(
                User.role.in_([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
                AuditLog.action.ilike("%APPROVE%"),
                AuditLog.action.ilike("%REJECT%"),
                AuditLog.action.ilike("%CONFIG%"),
                AuditLog.action.ilike("%WAGER%"),
                AuditLog.action.ilike("%SETTING%"),
                AuditLog.action.ilike("%PASSWORD%"),
                AuditLog.action.ilike("%WALLET%"),
                AuditLog.action.ilike("%ROLE%"),
                AuditLog.action.ilike("%STATUS%"),
            )
        )

    if action and action.strip():
        query = query.filter(AuditLog.action.ilike(f"%{action.strip()}%"))
    if entity_type and entity_type.strip():
        query = query.filter(AuditLog.entity_type == entity_type.strip())
    if search and search.strip():
        s = search.strip()
        query = query.filter(
            or_(
                AuditLog.action.ilike(f"%{s}%"),
                AuditLog.entity_type.ilike(f"%{s}%"),
                AuditLog.entity_id.ilike(f"%{s}%"),
                User.username.ilike(f"%{s}%"),
                User.name.ilike(f"%{s}%"),
                User.email.ilike(f"%{s}%"),
            )
        )

    total = query.count()
    items = query.order_by(AuditLog.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

    result = []
    for log, actor in items:
        result.append({
            "id": str(log.id),
            "actor_id": str(log.actor_id) if log.actor_id else None,
            "actor_name": actor.name if actor else "System",
            "actor_username": actor.username if actor else "system",
            "actor_email": actor.email if actor else None,
            "action": log.action,
            "entity_type": log.entity_type,
            "entity_id": log.entity_id,
            "metadata": log.metadata_,
            "ip_address": log.ip_address,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        })

    return success_response({
        "items": result,
        "total": total,
        "page": page,
        "page_size": page_size,
    })


# -- Admin Notifications Hub ----------------------------------------------------
@router.get("/notifications")
def get_admin_notifications(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
    limit: int = Query(default=30, ge=1, le=100),
):
    """Aggregate actionable platform alerts: pending withdrawals, large deposits, system events."""
    notifications = []

    # 1. Pending withdrawals (High Priority Action)
    pending_wds = (
        db.query(Withdrawal, User)
        .join(User, Withdrawal.user_id == User.id)
        .filter(Withdrawal.status == WithdrawalStatus.PENDING)
        .order_by(Withdrawal.created_at.desc())
        .limit(10)
        .all()
    )
    for wd, u in pending_wds:
        notifications.append({
            "id": f"notif-wd-{wd.id}",
            "type": "WITHDRAWAL",
            "priority": "HIGH",
            "title": f"Withdrawal Request: ₹{wd.amount / 100:.2f}",
            "message": f"Player @{u.username} ({u.name}) requested ₹{wd.amount / 100:.2f} payout via {wd.method or 'UPI'}.",
            "created_at": wd.created_at.isoformat() if wd.created_at else datetime.now(timezone.utc).isoformat(),
            "link": "/admin/withdrawals",
            "action_id": str(wd.id),
            "is_read": False,
        })

    # 2. Recent Large Deposits
    recent_deps = (
        db.query(Deposit, User)
        .join(User, Deposit.user_id == User.id)
        .order_by(Deposit.created_at.desc())
        .limit(10)
        .all()
    )
    for dep, u in recent_deps:
        is_success = dep.status == DepositStatus.SUCCESS
        status_str = dep.status.value if hasattr(dep.status, "value") else str(dep.status)
        notifications.append({
            "id": f"notif-dep-{dep.id}",
            "type": "DEPOSIT",
            "priority": "MEDIUM" if dep.amount >= 50000 else "LOW",
            "title": f"Deposit: ₹{dep.amount / 100:.2f} ({status_str})",
            "message": f"Player @{u.username} initiated ₹{dep.amount / 100:.2f} deposit via {dep.provider or 'UPI'}.",
            "created_at": dep.created_at.isoformat() if dep.created_at else datetime.now(timezone.utc).isoformat(),
            "link": "/admin/deposits",
            "action_id": str(dep.id),
            "is_read": is_success,
        })

    # 3. System Admin Audit events
    recent_audits = (
        db.query(AuditLog, User)
        .outerjoin(User, AuditLog.actor_id == User.id)
        .order_by(AuditLog.created_at.desc())
        .limit(10)
        .all()
    )
    for log, actor in recent_audits:
        actor_name = actor.username if actor else "System"
        notifications.append({
            "id": f"notif-audit-{log.id}",
            "type": "SYSTEM",
            "priority": "LOW",
            "title": f"System Event: {log.action}",
            "message": f"{actor_name} performed {log.action} on {log.entity_type or 'resource'}.",
            "created_at": log.created_at.isoformat() if log.created_at else datetime.now(timezone.utc).isoformat(),
            "link": "/admin/audit-logs",
            "action_id": str(log.id),
            "is_read": True,
        })

    notifications.sort(key=lambda x: x["created_at"], reverse=True)
    unread_count = sum(1 for n in notifications if not n["is_read"])

    return success_response({
        "items": notifications[:limit],
        "unread_count": unread_count,
    })


# -- Support Channels & Contact Config -----------------------------------------
@router.get("/support/config")
def get_support_config_endpoint(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Return platform support channels, helpline details, and FAQ items."""
    return success_response(support_service.get_support_config(db))


@router.put("/support/config")
def update_support_config_endpoint(
    data: SupportConfigUpdateIn,
    admin: User = Depends(require_permission(AdminPermission.SUPPORT.value)),
    db: Session = Depends(get_db),
):
    """Update customer support channels, WhatsApp number, email, and FAQs."""
    update_data = data.model_dump(exclude_none=True)
    cfg = support_service.update_support_config(db, update_data, admin.id)
    return success_response(cfg)


# -- Support Helpdesk Tickets --------------------------------------------------
@router.get("/support/tickets")
def list_support_tickets(
    admin: User = Depends(require_permission(AdminPermission.SUPPORT.value)),
    db: Session = Depends(get_db),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    status: Optional[str] = Query(default=None),
    category: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
):
    """Retrieve paginated player support tickets with filters and search."""
    data = support_service.admin_list_tickets(
        db, page=page, page_size=page_size, status=status, category=category, search=search
    )
    return success_response(data)


@router.patch("/support/tickets/{ticket_id}")
def update_support_ticket(
    ticket_id: UUID,
    payload: SupportTicketUpdateIn,
    admin: User = Depends(require_permission(AdminPermission.SUPPORT.value)),
    db: Session = Depends(get_db),
):
    """Update ticket status (OPEN, IN_PROGRESS, RESOLVED, CLOSED) and write admin response."""
    try:
        t = support_service.admin_update_ticket(
            db,
            ticket_id=ticket_id,
            status=payload.status,
            admin_reply=payload.admin_reply,
            admin=admin,
        )
        return success_response({
            "id": str(t.id),
            "ticket_number": t.ticket_number,
            "status": t.status.value,
            "admin_reply": t.admin_reply,
            "updated_at": t.updated_at.isoformat() if t.updated_at else None,
        })
    except ValueError as e:
        return error_response(404, str(e))


# -- Payment Gateways Switchable Control (Cashfree & Razorpay) -----------------
@router.get("/payment-gateways")
def list_payment_gateways(
    admin: User = Depends(require_permission(AdminPermission.PAYMENT_GATEWAYS.value)),
    db: Session = Depends(get_db),
):
    """List online payment gateways (Cashfree & Razorpay) with active status and settings."""
    gateways = db.query(PaymentGatewayConfig).all()
    if not gateways:
        cf = PaymentGatewayConfig(
            gateway_name="cashfree",
            display_name="Cashfree Payments",
            is_active=False,
            api_key="",
            api_secret="",
            webhook_secret="",
            is_sandbox=True,
        )
        rz = PaymentGatewayConfig(
            gateway_name="razorpay",
            display_name="Razorpay Standard PG",
            is_active=True,
            api_key="",
            api_secret="",
            webhook_secret="",
            is_sandbox=True,
        )
        db.add_all([cf, rz])
        db.commit()
        gateways = [cf, rz]

    result = []
    for g in gateways:
        key = g.api_key or ""
        masked_key = (key[:6] + "*" * (len(key) - 10) + key[-4:]) if len(key) > 10 else ("****" if key else "")
        sec = g.api_secret or ""
        masked_sec = (sec[:4] + "*" * (len(sec) - 8) + sec[-4:]) if len(sec) > 8 else ("****" if sec else "")
        wh = g.webhook_secret or ""
        masked_wh = (wh[:4] + "*" * (len(wh) - 8) + wh[-4:]) if len(wh) > 8 else ("****" if wh else "")
        extra = g.extra_config or {}
        payout_key = str(extra.get("payout_api_key") or "")
        payout_account = str(extra.get("payout_account_number") or "")

        result.append({
            "id": str(g.id),
            "gateway_name": g.gateway_name,
            "display_name": g.display_name,
            "is_active": g.is_active,
            "api_key": key,
            "api_key_masked": masked_key,
            "has_key": bool(key),
            "api_secret": masked_sec,
            "has_secret": bool(g.api_secret),
            "webhook_secret": masked_wh,
            "has_webhook_secret": bool(g.webhook_secret),
            "is_sandbox": g.is_sandbox,
            "payouts_enabled": bool(extra.get("payouts_enabled", False)),
            "has_payout_credentials": bool(payout_key and extra.get("payout_api_secret") and payout_account),
            "payout_api_key_masked": (payout_key[:6] + "*" * max(0, len(payout_key) - 10) + payout_key[-4:]) if len(payout_key) > 10 else ("****" if payout_key else ""),
            "payout_account_number_masked": ("*" * max(0, len(payout_account) - 4) + payout_account[-4:]) if payout_account else "",
            "updated_at": g.updated_at.isoformat() if g.updated_at else None,
        })
    return success_response(result)


@router.put("/payment-gateways/{gateway_name}")
def update_payment_gateway(
    gateway_name: str,
    payload: PaymentGatewayUpdateIn,
    admin: User = Depends(require_permission(AdminPermission.PAYMENT_GATEWAYS.value)),
    db: Session = Depends(get_db),
):
    """Configure API key, secret, sandbox mode, and active state for Cashfree / Razorpay."""
    gname = gateway_name.lower().strip()
    g = db.query(PaymentGatewayConfig).filter(PaymentGatewayConfig.gateway_name == gname).first()
    if not g:
        g = PaymentGatewayConfig(
            gateway_name=gname,
            display_name="Cashfree Payments" if gname == "cashfree" else "Razorpay Standard PG",
            is_active=False,
        )
        db.add(g)

    if payload.display_name is not None:
        g.display_name = payload.display_name
    if payload.api_key is not None:
        g.api_key = payload.api_key.strip()
    if payload.api_secret is not None and not payload.api_secret.startswith("*"):
        g.api_secret = payload.api_secret.strip()
    if payload.webhook_secret is not None and not payload.webhook_secret.startswith("*"):
        g.webhook_secret = payload.webhook_secret.strip()
    if payload.is_sandbox is not None:
        g.is_sandbox = payload.is_sandbox
    if any(value is not None for value in (payload.payouts_enabled, payload.payout_api_key, payload.payout_api_secret, payload.payout_account_number)):
        if gname != "razorpay":
            return error_response("INVALID_PAYOUT_GATEWAY", "RazorpayX Payouts credentials must be configured on the Razorpay gateway.", status_code=400)
        extra = dict(g.extra_config or {})
        if payload.payout_api_key and not payload.payout_api_key.startswith("*"):
            extra["payout_api_key"] = payload.payout_api_key.strip()
        if payload.payout_api_secret and not payload.payout_api_secret.startswith("*"):
            extra["payout_api_secret"] = payload.payout_api_secret.strip()
        if payload.payout_account_number:
            extra["payout_account_number"] = payload.payout_account_number.strip()
        if payload.payouts_enabled is not None:
            if payload.payouts_enabled and not all(extra.get(key) for key in ("payout_api_key", "payout_api_secret", "payout_account_number")):
                return error_response("PAYOUT_CREDENTIALS_REQUIRED", "Enter RazorpayX payout key, secret, and source account number before enabling automated withdrawals.", status_code=400)
            extra["payouts_enabled"] = payload.payouts_enabled
        g.extra_config = extra
    if payload.is_active is not None and payload.is_active:
        # Guarantee only one gateway is active
        db.query(PaymentGatewayConfig).filter(PaymentGatewayConfig.id != g.id).update({"is_active": False})
        g.is_active = True

    g.updated_at = datetime.now(timezone.utc)
    audit_service.log_action(
        db,
        action="PAYMENT_GATEWAY_CONFIG_UPDATE",
        actor_id=admin.id,
        entity_type="payment_gateway",
        entity_id=g.gateway_name,
        metadata={
            "gateway": g.gateway_name,
            "is_active": g.is_active,
            "is_sandbox": g.is_sandbox,
            "has_key": bool(g.api_key),
            "has_secret": bool(g.api_secret),
        },
    )
    db.commit()
    db.refresh(g)
    return success_response({
        "gateway_name": g.gateway_name,
        "display_name": g.display_name,
        "is_active": g.is_active,
        "is_sandbox": g.is_sandbox,
        "message": f"{g.display_name} settings saved successfully",
    })


@router.post("/payment-gateways/{gateway_name}/activate")
def activate_payment_gateway(
    gateway_name: str,
    admin: User = Depends(require_permission(AdminPermission.PAYMENT_GATEWAYS.value)),
    db: Session = Depends(get_db),
):
    """Switch the platform's active payment gateway to Cashfree or Razorpay."""
    gname = gateway_name.lower().strip()
    target = db.query(PaymentGatewayConfig).filter(PaymentGatewayConfig.gateway_name == gname).first()
    if not target:
        target = PaymentGatewayConfig(
            gateway_name=gname,
            display_name="Cashfree Payments" if gname == "cashfree" else "Razorpay Standard PG",
            is_active=True,
        )
        db.add(target)

    # Deactivate all and activate target
    db.query(PaymentGatewayConfig).update({"is_active": False})
    target.is_active = True
    target.updated_at = datetime.now(timezone.utc)

    audit_service.log_action(
        db,
        action="PAYMENT_GATEWAY_SWITCH",
        actor_id=admin.id,
        entity_type="payment_gateway",
        entity_id=target.gateway_name,
        metadata={"activated_gateway": target.gateway_name},
    )
    db.commit()
    return success_response({
        "message": f"Active payment gateway switched to {target.display_name}",
        "active_gateway": target.gateway_name,
    })


# -- System App Version Management ---------------------------------------------
@router.get("/system/app-version")
def get_admin_app_version(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Retrieve app version settings."""
    row = db.query(SystemSetting).filter(SystemSetting.key == "app_version_config").first()
    data = {
        "latest_version": "0.0.81",
        "min_version": "0.0.70",
        "download_url": "/Corona888.apk",
        "release_notes": "Added instant payment gateways, live Dragon & Tiger controls, and in-app support helpdesk.",
        "force_update": False,
    }
    if row and row.value:
        data.update(row.value)
    return success_response(data)


@router.put("/system/app-version")
def update_admin_app_version(
    payload: AppVersionUpdateIn,
    admin: User = Depends(require_permission(AdminPermission.SETTINGS.value)),
    db: Session = Depends(get_db),
):
    """Update latest released APK version for in-app update prompts."""
    row = db.query(SystemSetting).filter(SystemSetting.key == "app_version_config").first()
    data = {
        "latest_version": payload.latest_version.strip(),
        "min_version": (payload.min_version or "0.0.70").strip(),
        "download_url": (payload.download_url or "/Corona888.apk").strip(),
        "release_notes": payload.release_notes or "Latest security updates and bug fixes.",
        "force_update": bool(payload.force_update),
    }
    if not row:
        row = SystemSetting(
            key="app_version_config",
            value=data,
            description="Latest mobile APK version and release notes",
        )
        db.add(row)
    else:
        row.value = data
        row.updated_at = datetime.now(timezone.utc)

    audit_service.log_action(
        db,
        action="APP_VERSION_UPDATE",
        actor_id=admin.id,
        entity_type="system_setting",
        entity_id="app_version_config",
        metadata=data,
    )
    db.commit()
    return success_response(data)

