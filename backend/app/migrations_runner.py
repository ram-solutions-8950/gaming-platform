"""Apply pending Alembic migrations at application startup.

The app also calls ``Base.metadata.create_all`` during boot, which creates any
table a model declares. If that ran first, a pending migration that creates the
same table would fail, so migrations must be applied *before* create_all.

Every uvicorn worker runs the startup hook, so the upgrade is serialised behind
a Postgres advisory lock: the first worker migrates while the rest wait, then
find the database already at head and do nothing.
"""
from __future__ import annotations

from pathlib import Path

from sqlalchemy import text

from .config import settings
from .database import engine
from .utils.logging import get_logger

logger = get_logger("migrations")

# Arbitrary but fixed: every worker of this app must use the same key.
_ADVISORY_LOCK_KEY = 8_274_119_003_114_552

BACKEND_ROOT = Path(__file__).resolve().parents[1]


def _alembic_config():
    from alembic.config import Config

    cfg = Config(str(BACKEND_ROOT / "alembic.ini"))
    # script_location is relative in alembic.ini, so anchor it to the backend
    # directory rather than whatever cwd the process was launched from.
    cfg.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
    cfg.set_main_option("sqlalchemy.url", settings.DATABASE_URL)
    return cfg


def run_migrations() -> None:
    """Upgrade the database to head. Raises if a migration fails."""
    if not settings.AUTO_MIGRATE:
        logger.info("AUTO_MIGRATE is off; skipping startup migrations")
        return

    from alembic import command

    with engine.connect() as conn:
        conn.execute(text("SELECT pg_advisory_lock(:key)"), {"key": _ADVISORY_LOCK_KEY})
        conn.commit()
        try:
            logger.info("Applying pending migrations...")
            command.upgrade(_alembic_config(), "head")
            logger.info("Database schema is up to date")
        finally:
            conn.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": _ADVISORY_LOCK_KEY})
            conn.commit()
