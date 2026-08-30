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
from .routers import auth, users, wallet, transactions, deposits, withdrawals, payments, admin, fees, games, referral
from .services.game_engine import start_engine, stop_engine
from .websocket.manager import game_ws_manager


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: launch the game engine.  Shutdown: cancel it."""
    start_engine(broadcast_fn=game_ws_manager.broadcast)
    yield
    stop_engine()


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

# Static file serving — QR code uploads only
QR_UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads" / "qr"
QR_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads/qr", StaticFiles(directory=str(QR_UPLOAD_DIR)), name="qr_uploads")


@app.get("/api/v1/health", tags=["Health"])
async def health_check():
    return {"success": True, "data": {"status": "ok", "environment": settings.ENVIRONMENT}}

