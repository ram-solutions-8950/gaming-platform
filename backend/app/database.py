from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from .config import settings

db_url = settings.DATABASE_URL
if db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+psycopg2://", 1)

# Pool sizing matters more than it looks here. The default is 5 connections
# with 10 overflow, and this service runs a single uvicorn worker whose sync
# endpoints are dispatched across a 40-thread pool, on top of the game engine
# threads and the websocket offload threads. At a dozen concurrent players
# that default is exhausted, and every further request blocks for
# ``pool_timeout`` before failing -- which is what made the whole app appear
# to freeze and read zero.
#
# ``pool_timeout`` is deliberately short: failing fast with an error the
# frontend can show beats a 30 second hang that looks like a wiped balance.
# ``pool_recycle`` keeps connections under any idle timeout on the database
# side, and ``pool_pre_ping`` discards ones that died anyway.
engine = create_engine(
    db_url,
    pool_pre_ping=True,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_timeout=settings.DB_POOL_TIMEOUT,
    pool_recycle=settings.DB_POOL_RECYCLE,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass
