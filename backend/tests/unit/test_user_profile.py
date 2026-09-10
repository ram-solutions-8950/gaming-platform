from unittest.mock import MagicMock
from uuid import uuid4
from datetime import datetime, timezone
from app.schemas.user import UserOut, UserUpdateIn
from app.models.user import User, UserRole, UserStatus
from app.services.user_service import update_user_profile


def test_user_schemas_avatar_url():
    """Verify UserOut and UserUpdateIn support avatar_url."""
    user_id = uuid4()
    now = datetime.now(timezone.utc)

    user_out = UserOut(
        id=user_id,
        name="Test Player",
        username="testplayer",
        email="test@example.com",
        role=UserRole.USER,
        status=UserStatus.ACTIVE,
        created_at=now,
        avatar_url="👑",
    )
    assert user_out.avatar_url == "👑"

    update_in = UserUpdateIn(
        name="New Name",
        avatar_url="/uploads/avatars/test.jpg"
    )
    assert update_in.avatar_url == "/uploads/avatars/test.jpg"


def test_update_user_profile_avatar():
    """Verify update_user_profile correctly saves avatar_url on User."""
    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.first.return_value = None

    test_user = User(
        name="Avatar Tester",
        username=f"avatartest_{uuid4().hex[:6]}",
        email="avatar@test.com",
        password_hash="fakehash",
        role=UserRole.USER,
        status=UserStatus.ACTIVE,
    )

    assert test_user.avatar_url is None

    # Update avatar to emoji preset
    updated = update_user_profile(mock_db, test_user, avatar_url="🐉")
    assert updated.avatar_url == "🐉"
    mock_db.commit.assert_called()

    # Update avatar to image path
    updated2 = update_user_profile(mock_db, test_user, avatar_url="/uploads/avatars/my_photo.png")
    assert updated2.avatar_url == "/uploads/avatars/my_photo.png"
