from uuid import UUID
from typing import Optional
from sqlalchemy.orm import Session
from ..models.user import User


def get_user_by_id(db: Session, user_id: UUID) -> Optional[User]:
    return db.query(User).filter(User.id == user_id).first()


def update_user_profile(db: Session, user: User, name: Optional[str] = None, username: Optional[str] = None) -> User:
    if name is not None:
        user.name = name
    if username is not None:
        existing = db.query(User).filter(User.username == username, User.id != user.id).first()
        if existing:
            raise ValueError("Username already taken")
        user.username = username
    db.commit()
    db.refresh(user)
    return user
