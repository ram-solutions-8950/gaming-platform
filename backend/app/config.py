from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

PROJECT_ROOT = Path(__file__).resolve().parents[2]

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(PROJECT_ROOT / ".env"), extra="ignore")

    ENVIRONMENT: str = "development"
    CORS_ORIGINS: List[str] = ["http://localhost:5173", "https://5d61-183-82-187-74.ngrok-free.app", "http://localhost", "https://localhost", "capacitor://localhost"]
    DATABASE_URL: str = "postgresql://postgres@localhost:5432/gaming_db"
    REDIS_URL: str = "redis://localhost:6379/0"

    JWT_SECRET: str = "change-me-in-production"
    JWT_REFRESH_SECRET: str = "refresh-change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    PAYMENT_PROVIDER: str = ""
    PAYMENT_API_KEY: str = ""
    PAYMENT_SECRET: str = ""
    PAYMENT_WEBHOOK_SECRET: str = ""

settings = Settings()

