import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
from pathlib import Path
from app.main import app
from app.database import Base
from app.dependencies.database import get_db
from app.middleware.rate_limiter import limiter

# Load .env from project root
load_dotenv(Path(__file__).resolve().parents[3] / ".env")

TEST_DB_URL = os.getenv("TEST_DATABASE_URL", "postgresql://postgres@localhost:5432/gaming_test_db")

engine = create_engine(TEST_DB_URL)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="session", autouse=True)
def setup_database():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    limiter._storage.storage.clear()
    limiter._storage.expirations.clear()
    limiter._storage.events.clear()
    yield
    limiter._storage.storage.clear()
    limiter._storage.expirations.clear()
    limiter._storage.events.clear()


@pytest.fixture()
def db():
    db = TestingSessionLocal()
    yield db
    db.rollback()
    db.close()


@pytest.fixture()
def client():
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
