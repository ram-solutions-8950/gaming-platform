import asyncio
from app.database import SessionLocal
from app.models.game_catalog import Game, GameStatus

def seed_ludo():
    db = SessionLocal()
    try:
        game = db.query(Game).filter(Game.slug == "ludo").first()
        if not game:
            game = Game(
                name="Ludo",
                slug="ludo",
                game_type="MULTIPLAYER",
                description="Classic Ludo Multiplayer Game",
                status=GameStatus.ACTIVE,
                min_bet=0,
                max_bet=0,
                config={"entry_fee": 1000, "platform_fee_percent": 10}
            )
            db.add(game)
            db.commit()
            print("Ludo seeded")
        else:
            print("Ludo already exists")
    finally:
        db.close()

if __name__ == "__main__":
    seed_ludo()
