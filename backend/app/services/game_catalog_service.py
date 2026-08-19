from sqlalchemy.orm import Session
from uuid import UUID
from typing import List, Optional
from ..models.game_catalog import Game, GameStatus
from ..schemas.game_catalog import GameCreate, GameUpdate


def get_game(db: Session, game_id: UUID) -> Optional[Game]:
    return db.query(Game).filter(Game.id == game_id).first()


def get_game_by_slug(db: Session, slug: str) -> Optional[Game]:
    return db.query(Game).filter(Game.slug == slug).first()


def list_games(db: Session, active_only: bool = True) -> List[Game]:
    query = db.query(Game)
    if active_only:
        query = query.filter(Game.status == GameStatus.ACTIVE)
    return query.all()


def create_game(db: Session, data: GameCreate, admin_id: UUID) -> Game:
    if get_game_by_slug(db, data.slug):
        raise ValueError(f"Game with slug '{data.slug}' already exists.")
    
    if data.min_bet < 0 or data.max_bet < 0 or data.min_bet > data.max_bet:
        raise ValueError("Invalid min_bet or max_bet.")

    game = Game(
        name=data.name,
        slug=data.slug,
        game_type=data.game_type,
        description=data.description,
        icon_url=data.icon_url,
        status=GameStatus.ACTIVE,
        min_bet=data.min_bet,
        max_bet=data.max_bet,
        config=data.config,
        created_by_id=admin_id,
        updated_by_id=admin_id,
    )
    db.add(game)
    db.commit()
    db.refresh(game)
    return game


def update_game(db: Session, game_id: UUID, data: GameUpdate, admin_id: UUID) -> Game:
    game = get_game(db, game_id)
    if not game:
        raise ValueError("Game not found.")

    if data.name is not None:
        game.name = data.name
    if data.description is not None:
        game.description = data.description
    if data.icon_url is not None:
        game.icon_url = data.icon_url
    if data.min_bet is not None:
        game.min_bet = data.min_bet
    if data.max_bet is not None:
        game.max_bet = data.max_bet
    if data.config is not None:
        game.config = data.config

    if game.min_bet < 0 or game.max_bet < 0 or game.min_bet > game.max_bet:
        raise ValueError("Invalid min_bet or max_bet.")

    game.updated_by_id = admin_id
    db.commit()
    db.refresh(game)
    return game


def activate_game(db: Session, game_id: UUID, admin_id: UUID) -> Game:
    game = get_game(db, game_id)
    if not game:
        raise ValueError("Game not found.")
    
    game.status = GameStatus.ACTIVE
    game.updated_by_id = admin_id
    db.commit()
    db.refresh(game)
    return game


def deactivate_game(db: Session, game_id: UUID, admin_id: UUID) -> Game:
    game = get_game(db, game_id)
    if not game:
        raise ValueError("Game not found.")
    
    game.status = GameStatus.INACTIVE
    game.updated_by_id = admin_id
    db.commit()
    db.refresh(game)
    return game
