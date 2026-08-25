import uuid
import pytest
from unittest.mock import patch
from sqlalchemy.orm import Session

from app.services.ludo.engine import LudoEngine
from app.models.wallet import Wallet
from app.models.transaction import WalletTransaction, WalletTransactionType
from app.models.ludo import LudoMatchStatus, LudoColor

@pytest.fixture
def two_users(db):
    """Create two test users."""
    from app.models.user import User
    from app.security.password import hash_password
    from app.models.wallet import Wallet
    from app.models.game_catalog import Game, GameStatus
    import uuid
    suffix = str(uuid.uuid4())[:8]
    u1 = User(name=f"LudoA_{suffix}", username=f"ludoa_{suffix}", email=f"ludoa_{suffix}@test.com", password_hash=hash_password("pass123"))
    u2 = User(name=f"LudoB_{suffix}", username=f"ludob_{suffix}", email=f"ludob_{suffix}@test.com", password_hash=hash_password("pass123"))
    db.add_all([u1, u2])
    db.flush()
    
    w1 = Wallet(user_id=u1.id, balance=100000)
    w2 = Wallet(user_id=u2.id, balance=100000)
    db.add_all([w1, w2])
    
    game = db.query(Game).filter(Game.slug == "ludo").first()
    if not game:
        game = Game(name="Ludo", slug="ludo", game_type="MULTIPLAYER", status=GameStatus.ACTIVE, min_bet=0, max_bet=0, config={"entry_fee": 1000, "platform_fee_percent": 10})
        db.add(game)
    else:
        game.config = {"entry_fee": 1000, "platform_fee_percent": 10}
        
    db.commit()
    return u1, u2

class TestLudoWalletIntegration:

    def test_successful_entry_debit(self, db, two_users):
        u1, u2 = two_users
        engine = LudoEngine(db)
        match = engine.create_match(u1.id)
        engine.join_match(match.id, u2.id)
        
        # u1 and u2 have 100000 balance each
        w1 = db.query(Wallet).filter(Wallet.user_id == u1.id).first()
        w2 = db.query(Wallet).filter(Wallet.user_id == u2.id).first()
        
        assert w1.balance == 100000
        assert w2.balance == 100000
        
        engine.set_ready(match.id, u1.id)
        match = engine.set_ready(match.id, u2.id)
        
        assert match.status == LudoMatchStatus.IN_PROGRESS
        assert match.entry_fee == 1000
        assert match.prize_pool == 2000
        
        db.refresh(w1)
        db.refresh(w2)
        assert w1.balance == 99000
        assert w2.balance == 99000
        
        txs = db.query(WalletTransaction).filter(
            WalletTransaction.reference_type == "ludo_entry",
            WalletTransaction.reference_id.like(f"{match.id}_%")
        ).all()
        assert len(txs) == 2

    def test_insufficient_balance_prevents_start(self, db, two_users):
        u1, u2 = two_users
        
        # Drain u2 balance
        w2 = db.query(Wallet).filter(Wallet.user_id == u2.id).first()
        w2.balance = 0
        db.commit()
        
        engine = LudoEngine(db)
        match = engine.create_match(u1.id)
        engine.join_match(match.id, u2.id)
        
        engine.set_ready(match.id, u1.id)
        
        with pytest.raises(ValueError, match="Insufficient balance"):
            engine.set_ready(match.id, u2.id)
            
        db.rollback() # Simulate API rollback
        match = db.query(type(match)).filter(type(match).id == match.id).first()
        
        assert match.status == LudoMatchStatus.WAITING
        w1 = db.query(Wallet).filter(Wallet.user_id == u1.id).first()
        assert w1.balance == 100000 # No partial debit

    def test_winner_settlement(self, db, two_users):
        u1, u2 = two_users
        engine = LudoEngine(db)
        match = engine.create_match(u1.id)
        engine.join_match(match.id, u2.id)
        
        engine.set_ready(match.id, u1.id)
        match = engine.set_ready(match.id, u2.id)
        
        w1_before = db.query(Wallet).filter(Wallet.user_id == u1.id).first().balance
        
        # Force u1 to win
        player = match.players[0]
        assert player.user_id == u1.id
        for i, t in enumerate(player.tokens):
            if i < 3:
                t.position = 57
                t.is_home = True
            else:
                t.position = 56 # exactly one step away from home
                
        db.commit()
        
        # move exactly to 57 with a roll of 1
        with patch("app.services.ludo.engine.roll_dice", return_value=1):
            engine.roll_dice(match.id, u1.id, str(uuid.uuid4()))
        engine.move_token(match.id, u1.id, 3, str(uuid.uuid4()))
        
        db.refresh(match)
        assert match.is_settled == True
        
        w1 = db.query(Wallet).filter(Wallet.user_id == u1.id).first()
        # 10% fee on 2000 pool = 200, net win = 1800
        # started at 99000 + 1800 = 100800
        assert w1.balance == 100800
        
        txs = db.query(WalletTransaction).filter(
            WalletTransaction.reference_type == "ludo_win",
            WalletTransaction.reference_id == str(match.id)
        ).all()
        assert len(txs) == 1
        assert txs[0].amount == 1800
