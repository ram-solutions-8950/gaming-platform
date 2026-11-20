from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

PROJECT_ROOT = Path(__file__).resolve().parents[2]

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(PROJECT_ROOT / ".env"), extra="ignore")

    ENVIRONMENT: str = "development"
    CORS_ORIGINS: List[str] = [
        "https://corona888.tech",
        "https://www.corona888.tech",
        "https://admin.corona888.tech",
        "http://corona888.tech",
        "http://www.corona888.tech",
        "http://admin.corona888.tech",
        "https://crona888.com",
        "https://www.crona888.com",
        "https://admin.crona888.com",
        "http://crona888.com",
        "http://www.crona888.com",
        "http://admin.crona888.com",
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost",
        "https://localhost",
        "capacitor://localhost",
        "https://5d61-183-82-187-74.ngrok-free.app",
    ]
    DATABASE_URL: str = "postgresql://postgres@localhost:5432/gaming_db"
    FRONTEND_URL: str = "http://localhost:5173"
    PUBLIC_DOWNLOAD_URL: str = "https://polandexim.com/download"
    # Apply pending Alembic migrations automatically on startup.
    # Disable to gate schema changes behind a manual deploy step.
    AUTO_MIGRATE: bool = True
    REDIS_URL: str = "redis://localhost:6379/0"

    # Connection pool. Keep (DB_POOL_SIZE + DB_MAX_OVERFLOW) x worker count
    # comfortably under the database's max_connections.
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 30
    DB_POOL_TIMEOUT: int = 10     # seconds to wait for a free connection
    DB_POOL_RECYCLE: int = 1800   # recycle connections every 30 minutes

    LOG_LEVEL: str = "INFO"

    JWT_SECRET: str = "change-me-in-production"
    JWT_REFRESH_SECRET: str = "refresh-change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 days for seamless gaming sessions
    REFRESH_TOKEN_EXPIRE_DAYS: int = 90

    PAYMENT_API_KEY: str = ""
    PAYMENT_SECRET: str = ""
    PAYMENT_WEBHOOK_SECRET: str = ""
    CASHFREE_RETURN_URL: str = "https://polandexim.com/wallet?status={order_status}&order_id={order_id}"
    CASHFREE_NOTIFY_URL: str = "https://polandexim.com/api/v1/payments/webhook?provider=cashfree"

    # Easebuzz sends the player's BROWSER to these with a form POST carrying
    # the signed result, so they must point at the return endpoint (which
    # verifies, credits and then redirects) and not at the JSON webhook.
    # Both are mandatory in the initiateLink request; a gateway row may
    # override them via extra_config.
    EASEBUZZ_SURL: str = "https://polandexim.com/api/v1/payments/easebuzz/return"
    EASEBUZZ_FURL: str = "https://polandexim.com/api/v1/payments/easebuzz/return"

    # Gateway credentials are NOT configured here. Every gateway's keys,
    # secrets and sandbox flag live in payment_gateway_configs and are
    # entered in Admin Panel > Payment Gateways, so that rotating a key
    # never needs a redeploy and a stale environment variable can never
    # quietly take over from what an admin set.
    #
    # Deposit gateway fallback, used only when no gateway row is marked
    # active yet: "easebuzz", "cashfree" or "razorpay". The active row in
    # the admin panel overrides it.
    PAYMENT_PROVIDER: str = ""

settings = Settings()

