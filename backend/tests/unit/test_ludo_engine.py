import pytest
import uuid
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models.ludo import LudoMatch, LudoPlayer, LudoToken, LudoMatchStatus, LudoColor
from app.services.ludo.engine import LudoEngine
from app.models.idempotency import IdempotencyKey
from app.database import Base

@pytest.fixture(scope="module")
def engine():
    return create_engine("sqlite:///:memory:")

@pytest.fixture(scope="module")
def tables(engine):
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)

@pytest.fixture
def db_session(engine, tables):
    connection = engine.connect()
    transaction = connection.begin()
    Session = sessionmaker(bind=connection)
    session = Session()
    yield session
    session.close()
    transaction.rollback()
    connection.close()

def test_create_match(db_session):
    ludo_engine = LudoEngine(db_session)
    user_id = uuid.uuid4()
    match = ludo_engine.create_match(user_id)
    
    assert match.status == LudoMatchStatus.WAITING
    assert len(match.players) == 1
    assert match.players[0].user_id == user_id
    assert match.players[0].color == LudoColor.RED
    assert len(match.players[0].tokens) == 4

def test_join_match(db_session):
    ludo_engine = LudoEngine(db_session)
    user_id1 = uuid.uuid4()
    user_id2 = uuid.uuid4()
    
    match = ludo_engine.create_match(user_id1)
    match2 = ludo_engine.join_match(match.id, user_id2)
    
    assert len(match2.players) == 2
    assert match2.players[1].user_id == user_id2
    assert match2.players[1].color == LudoColor.GREEN

def test_set_ready_and_start(db_session):
    ludo_engine = LudoEngine(db_session)
    user_id1 = uuid.uuid4()
    user_id2 = uuid.uuid4()
    
    match = ludo_engine.create_match(user_id1)
    ludo_engine.join_match(match.id, user_id2)
    
    ludo_engine.set_ready(match.id, user_id1)
    assert match.status == LudoMatchStatus.WAITING
    
    ludo_engine.set_ready(match.id, user_id2)
    assert match.status == LudoMatchStatus.IN_PROGRESS
    assert match.current_turn_color == LudoColor.RED
