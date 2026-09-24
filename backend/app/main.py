from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler
from pathlib import Path

from .config import settings
from .utils.exceptions import http_exception_handler, validation_exception_handler
from .middleware.rate_limiter import limiter
from .routers import auth, users, wallet, transactions, deposits, withdrawals, payments, admin, fees, games, referral, rewards
from .services.game_engine import start_engine, stop_engine
from .websocket.manager import game_ws_manager


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: initialize DB tables & default rewards, launch the game engine. Shutdown: cancel it."""
    try:
        from .database import engine, SessionLocal
        from .models.reward import Base

        # Migrations first: create_all would otherwise create a table that a
        # pending migration also creates, making the migration fail.
        from .migrations_runner import run_migrations
        run_migrations()

        Base.metadata.create_all(bind=engine)
        from .services.reward_service import seed_default_reward_configs
        with SessionLocal() as db:
            from sqlalchemy import text
            try:
                db.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;"))
                db.commit()
            except Exception:
                db.rollback()
            seed_default_reward_configs(db)

            # Make sure the singleton settings rows exist so the admin panel
            # can edit them immediately. Both are seeded with neutral defaults:
            # commission stays at 0% until an operator sets a rate.
            from .models.fee_configuration import FeeConfiguration
            if db.query(FeeConfiguration).first() is None:
                db.add(FeeConfiguration())
                db.commit()
            from .services.referral_service import get_referral_settings
            get_referral_settings(db)

            from .models.game_catalog import Game
            ab = db.query(Game).filter(Game.slug == "andar-bahar").first()
            if ab:
                cfg = dict(ab.config or {})
                if cfg.get("round_duration_seconds") != 18 or cfg.get("betting_duration_seconds") != 15:
                    cfg["round_duration_seconds"] = 18
                    cfg["betting_duration_seconds"] = 15
                    ab.config = cfg
                    db.commit()
            dt = db.query(Game).filter(Game.slug == "dragon-tiger").first()
            if dt:
                cfg = dict(dt.config or {})
                if cfg.get("round_duration_seconds") != 18 or cfg.get("betting_duration_seconds") != 15:
                    cfg["round_duration_seconds"] = 18
                    cfg["betting_duration_seconds"] = 15
                    dt.config = cfg
                    db.commit()
            roulette_game = db.query(Game).filter(Game.slug == "roulette").first()
            if not roulette_game:
                from .models.game_catalog import GameStatus
                db.add(Game(
                    name="Roulette",
                    slug="roulette",
                    game_type="TABLE",
                    description="European Roulette live table game.",
                    status=GameStatus.ACTIVE,
                    min_bet=100,
                    max_bet=5000000,
                    config={"round_duration_seconds": 27, "betting_duration_seconds": 15},
                ))
                db.commit()
    except Exception as e:
        pass
    start_engine(broadcast_fn=game_ws_manager.broadcast)
    yield
    stop_engine()
    # Stakes of games that live in memory would vanish with the process: pay
    # out or refund whatever is still in play before exit.
    from .websocket.poker_ws import cash_out_all_tables
    from .websocket.teen_patti_ws import refund_live_hands
    from .websocket.rummy_ws import refund_live_deals
    from .routers.chicken_road import void_active_rounds
    from .services.roulette.engine import refund_open_round
    for settle_in_flight in (refund_live_hands, refund_live_deals, void_active_rounds, refund_open_round):
        try:
            settle_in_flight()
        except Exception as exc:
            print(f"[SHUTDOWN] {settle_in_flight.__name__} failed: {exc}")
    await cash_out_all_tables()


app = FastAPI(
    title="Gaming Platform API",
    version="1.0.0",
    openapi_url="/api/v1/openapi.json",
    docs_url="/api/v1/docs",
    redoc_url="/api/v1/redoc",
    lifespan=lifespan,
)

# Rate limiter state
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Exception handlers
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)

# Routers
PREFIX = "/api/v1"
app.include_router(auth.router, prefix=PREFIX)
app.include_router(users.router, prefix=PREFIX)
app.include_router(wallet.router, prefix=PREFIX)
app.include_router(transactions.router, prefix=PREFIX)
app.include_router(deposits.router, prefix=PREFIX)
app.include_router(withdrawals.router, prefix=PREFIX)
app.include_router(payments.router, prefix=PREFIX)
app.include_router(admin.router, prefix=PREFIX)
app.include_router(fees.router, prefix=PREFIX)
app.include_router(games.router, prefix=PREFIX)
app.include_router(referral.router, prefix=PREFIX)
app.include_router(rewards.router, prefix=PREFIX)
from .routers import ludo, rummy, teen_patti, aviator, poker, chicken_road, triple_777, roulette
from .websocket import teen_patti_ws, aviator_ws, poker_ws
app.include_router(ludo.router, prefix=PREFIX)
app.include_router(rummy.router, prefix=PREFIX)
app.include_router(teen_patti.router, prefix=PREFIX)
app.include_router(teen_patti_ws.router, prefix=PREFIX)
app.include_router(aviator.router, prefix=PREFIX)
app.include_router(aviator_ws.router, prefix=PREFIX)
app.include_router(poker.router, prefix=PREFIX)
app.include_router(poker_ws.router, prefix=PREFIX)
app.include_router(chicken_road.router, prefix=PREFIX)
app.include_router(triple_777.router, prefix=PREFIX)
app.include_router(roulette.router, prefix=PREFIX)

# Static file serving — QR code and Avatar uploads
QR_UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads" / "qr"
QR_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads/qr", StaticFiles(directory=str(QR_UPLOAD_DIR)), name="qr_uploads")

AVATAR_UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads" / "avatars"
AVATAR_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads/avatars", StaticFiles(directory=str(AVATAR_UPLOAD_DIR)), name="avatar_uploads")


@app.get("/api/v1/health", tags=["Health"])
async def health_check():
    return {"success": True, "data": {"status": "ok", "environment": settings.ENVIRONMENT}}

