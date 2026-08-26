from app.database import SessionLocal
from app.models.game_catalog import Game, GameStatus


GAMES = [
    {
        "name": "Ludo",
        "slug": "ludo",
        "game_type": "MULTIPLAYER",
        "description": "Classic Ludo multiplayer game.",
        "min_bet": 0,
        "max_bet": 100000,
        "config": {
            "entry_fee": 1000,
            "platform_fee_percent": 10,
            "players": [2, 4],
        },
    },
    {
        "name": "Triple 777 Classic",
        "slug": "triple-777",
        "game_type": "SLOT",
        "description": "Classic Triple 777 slot machine.",
        "min_bet": 10,
        "max_bet": 10000,
        "config": {
            "jackpot": True,
        },
    },
    {
        "name": "Chicken Road",
        "slug": "chicken-road",
        "game_type": "ARCADE",
        "description": "Chicken Road arcade crossing game.",
        "min_bet": 1,
        "max_bet": 50000,
        "config": {
            "difficulties": ["EASY", "MEDIUM", "HARD"],
        },
    },
]


def seed():
    db = SessionLocal()

    try:
        for item in GAMES:
            game = db.query(Game).filter(Game.slug == item["slug"]).first()

            if game:
                print(f"EXISTS: {item['name']}")
                continue

            game = Game(
                name=item["name"],
                slug=item["slug"],
                game_type=item["game_type"],
                description=item["description"],
                status=GameStatus.ACTIVE,
                min_bet=item["min_bet"],
                max_bet=item["max_bet"],
                config=item["config"],
            )

            db.add(game)
            print(f"ADDING: {item['name']}")

        db.commit()
        print("DONE")

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()


if __name__ == "__main__":
    seed()
