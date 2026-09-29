"""Winning Control Service — Global Game RTP and Personal User Luck / Win Override."""
from typing import Optional, List, Dict, Any
from uuid import UUID
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy import or_, func, String

from ..models.winning import UserWinningControl, WinMode
from ..models.game_catalog import Game, GameStatus
from ..models.user import User
from ..utils.logging import get_logger

logger = get_logger("winning_service")


DEFAULT_GLOBAL_WINNING_CONFIG = {
    "mode": "HOUSE_EDGE",      # HOUSE_EDGE, FAIR, HIGH_PAYOUT
    "rtp_percent": 95,
    "house_edge_percent": 5,
}


def get_global_winning_configs(db: Session) -> List[Dict[str, Any]]:
    """Return all catalog games with their active global winning and RTP settings."""
    games = db.query(Game).order_by(Game.name.asc()).all()
    results = []
    for g in games:
        cfg = g.config or {}
        win_cfg = cfg.get("winning_settings") or DEFAULT_GLOBAL_WINNING_CONFIG.copy()
        results.append({
            "game_id": str(g.id),
            "name": g.name,
            "slug": g.slug,
            "game_type": g.game_type,
            "status": g.status.value if hasattr(g.status, "value") else str(g.status),
            "mode": win_cfg.get("mode", "HOUSE_EDGE"),
            "rtp_percent": win_cfg.get("rtp_percent", 95),
            "house_edge_percent": win_cfg.get("house_edge_percent", 5),
            "min_bet": g.min_bet,
            "max_bet": g.max_bet,
            "updated_at": g.updated_at.isoformat() if g.updated_at else None,
        })
    return results


def update_global_winning_config(
    db: Session,
    game_slug: str,
    mode: str,
    rtp_percent: int,
) -> Dict[str, Any]:
    """Update global winning setting & RTP for a game."""
    game = db.query(Game).filter(Game.slug == game_slug).first()
    if not game:
        raise ValueError(f"Game with slug '{game_slug}' not found")

    cfg = dict(game.config or {})
    win_cfg = cfg.get("winning_settings") or {}
    win_cfg["mode"] = mode
    win_cfg["rtp_percent"] = max(1, min(100, int(rtp_percent)))
    win_cfg["house_edge_percent"] = 100 - win_cfg["rtp_percent"]
    win_cfg["updated_at"] = datetime.now(timezone.utc).isoformat()
    cfg["winning_settings"] = win_cfg

    # Also keep lower_total_wins synced for Dragon Tiger & similar pool games
    if mode == "HOUSE_EDGE":
        cfg["lower_total_wins"] = True
    elif mode == "FAIR":
        cfg["lower_total_wins"] = False

    game.config = cfg
    flag_modified(game, "config")
    db.commit()
    db.refresh(game)

    logger.info("Updated global winning config for %s: mode=%s rtp=%s%%", game_slug, mode, rtp_percent)
    return {
        "game_id": str(game.id),
        "slug": game.slug,
        "name": game.name,
        "mode": win_cfg["mode"],
        "rtp_percent": win_cfg["rtp_percent"],
        "house_edge_percent": win_cfg["house_edge_percent"],
    }


def get_personal_winning_controls(
    db: Session,
    page: int = 1,
    page_size: int = 20,
    search: Optional[str] = None,
) -> Dict[str, Any]:
    """List all users with personal winning overrides, optionally filtered by user search."""
    q = db.query(UserWinningControl).join(User, UserWinningControl.user_id == User.id)

    if search:
        s = f"%{search.strip()}%"
        q = q.filter(
            or_(
                User.username.ilike(s),
                User.name.ilike(s),
                User.email.ilike(s),
                func.cast(User.id, String).ilike(s),
            )
        )

    total = q.count()
    items = (
        q.order_by(UserWinningControl.updated_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    formatted_items = []
    for ctrl in items:
        u = ctrl.user
        formatted_items.append({
            "id": str(ctrl.id),
            "user_id": str(ctrl.user_id),
            "username": u.username if u else "Unknown",
            "name": u.name if u else "Unknown",
            "email": u.email if u else "Unknown",
            "mode": ctrl.mode,
            "win_rate_percent": ctrl.win_rate_percent,
            "note": ctrl.note,
            "created_at": ctrl.created_at.isoformat() if ctrl.created_at else None,
            "updated_at": ctrl.updated_at.isoformat() if ctrl.updated_at else None,
        })

    return {
        "items": formatted_items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


def set_personal_winning_control(
    db: Session,
    user_id: UUID,
    mode: str,
    win_rate_percent: Optional[int] = 50,
    note: Optional[str] = None,
) -> Dict[str, Any]:
    """Create or update a personal winning override for a specific user."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise ValueError(f"User '{user_id}' not found")

    ctrl = db.query(UserWinningControl).filter(UserWinningControl.user_id == user_id).first()
    if not ctrl:
        ctrl = UserWinningControl(
            user_id=user_id,
            mode=mode,
            win_rate_percent=win_rate_percent,
            note=note,
        )
        db.add(ctrl)
    else:
        ctrl.mode = mode
        if win_rate_percent is not None:
            ctrl.win_rate_percent = win_rate_percent
        if note is not None:
            ctrl.note = note
        ctrl.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(ctrl)

    logger.info("Personal winning control set for user=%s mode=%s rate=%s%%", user.username, mode, win_rate_percent)
    return {
        "id": str(ctrl.id),
        "user_id": str(ctrl.user_id),
        "username": user.username,
        "name": user.name,
        "mode": ctrl.mode,
        "win_rate_percent": ctrl.win_rate_percent,
        "note": ctrl.note,
        "updated_at": ctrl.updated_at.isoformat() if ctrl.updated_at else None,
    }


def delete_personal_winning_control(db: Session, user_id: UUID) -> bool:
    """Delete a user's personal winning override, restoring them to global game default."""
    ctrl = db.query(UserWinningControl).filter(UserWinningControl.user_id == user_id).first()
    if not ctrl:
        return False
    db.delete(ctrl)
    db.commit()
    logger.info("Personal winning control removed for user=%s", user_id)
    return True


def resolve_user_win_mode(db: Session, user_id: UUID, game_slug: Optional[str] = None) -> Dict[str, Any]:
    """Check both personal override and global game setting for a user."""
    ctrl = db.query(UserWinningControl).filter(UserWinningControl.user_id == user_id).first()
    if ctrl and ctrl.mode != WinMode.DEFAULT.value:
        return {
            "source": "PERSONAL",
            "mode": ctrl.mode,
            "win_rate_percent": ctrl.win_rate_percent or 50,
        }

    # Fallback to game's global config
    if game_slug:
        game = db.query(Game).filter(Game.slug == game_slug).first()
        if game and game.config:
            win_cfg = game.config.get("winning_settings")
            if win_cfg:
                return {
                    "source": "GLOBAL_GAME",
                    "mode": win_cfg.get("mode", "HOUSE_EDGE"),
                    "rtp_percent": win_cfg.get("rtp_percent", 95),
                }

    return {
        "source": "GLOBAL_DEFAULT",
        "mode": "HOUSE_EDGE",
        "rtp_percent": 95,
    }
