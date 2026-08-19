import pytest
from uuid import uuid4
from sqlalchemy.orm import Session

from app.models.user import User, UserRole, UserStatus
from app.models.game_catalog import Game, GameStatus

@pytest.fixture
def super_admin_headers(client, db: Session):
    rand_suffix = str(uuid4())[:8]
    super_admin = User(
        id=uuid4(),
        name="Super Admin User",
        username=f"superadmin_{rand_suffix}",
        email=f"superadmin_{rand_suffix}@example.com",
        password_hash="fakehash",
        role=UserRole.SUPER_ADMIN,
        status=UserStatus.ACTIVE
    )
    db.add(super_admin)
    db.commit()
    from app.security.jwt import create_access_token
    token = create_access_token(str(super_admin.id), super_admin.role.value)
    return {"Authorization": f"Bearer {token}"}, super_admin

@pytest.fixture
def auth_headers(client, db: Session):
    rand_suffix = str(uuid4())[:8]
    user = User(
        id=uuid4(),
        name="Test User",
        username=f"testuser_{rand_suffix}",
        email=f"testuser_{rand_suffix}@example.com",
        password_hash="fakehash",
        role=UserRole.USER,
        status=UserStatus.ACTIVE
    )
    db.add(user)
    db.commit()
    from app.security.jwt import create_access_token
    token = create_access_token(str(user.id), user.role.value)
    return {"Authorization": f"Bearer {token}"}, user

def test_super_admin_can_create_game(client, super_admin_headers, db: Session):
    headers, admin = super_admin_headers
    data = {
        "name": "Dragon Tiger",
        "slug": f"dragon-tiger-{uuid4().hex[:6]}",
        "game_type": "CARD_GAME",
        "description": "Dragon vs Tiger",
        "min_bet": 1000,
        "max_bet": 100000
    }
    res = client.post("/api/v1/admin/games", json=data, headers=headers)
    assert res.status_code == 201
    assert res.json()["data"]["name"] == "Dragon Tiger"

def test_normal_user_cannot_create_update_game(client, auth_headers):
    headers, user = auth_headers
    data = {
        "name": "Roulette",
        "slug": f"roulette-{uuid4().hex[:6]}",
        "game_type": "CASINO",
        "min_bet": 1000,
        "max_bet": 100000
    }
    res = client.post("/api/v1/admin/games", json=data, headers=headers)
    assert res.status_code in [401, 403]
    
    # Try update
    res2 = client.patch(f"/api/v1/admin/games/{str(uuid4())}", json={"name": "Roulette 2"}, headers=headers)
    assert res2.status_code in [401, 403]

def test_duplicate_slug_rejected(client, super_admin_headers):
    headers, admin = super_admin_headers
    slug = f"dup-game-{uuid4().hex[:6]}"
    data = {
        "name": "Dup Game",
        "slug": slug,
        "game_type": "TEST",
        "min_bet": 1000,
        "max_bet": 100000
    }
    client.post("/api/v1/admin/games", json=data, headers=headers)
    
    # Try duplicate
    res = client.post("/api/v1/admin/games", json=data, headers=headers)
    assert res.status_code == 400
    assert "already exists" in res.json()["error"]["message"]

def test_invalid_min_max_rejected(client, super_admin_headers):
    headers, admin = super_admin_headers
    data = {
        "name": "Invalid Bet Game",
        "slug": f"invalid-game-{uuid4().hex[:6]}",
        "game_type": "TEST",
        "min_bet": 100000,
        "max_bet": 1000 # Max < Min
    }
    res = client.post("/api/v1/admin/games", json=data, headers=headers)
    assert res.status_code == 400
    assert "Invalid min_bet or max_bet" in res.json()["error"]["message"]

def test_activate_deactivate_works(client, super_admin_headers, db: Session):
    headers, admin = super_admin_headers
    data = {
        "name": "Toggle Game",
        "slug": f"toggle-game-{uuid4().hex[:6]}",
        "game_type": "TEST",
        "min_bet": 1000,
        "max_bet": 100000
    }
    create_res = client.post("/api/v1/admin/games", json=data, headers=headers)
    game_id = create_res.json()["data"]["id"]
    
    # Deactivate
    deact_res = client.post(f"/api/v1/admin/games/{game_id}/deactivate", headers=headers)
    assert deact_res.status_code == 200
    assert deact_res.json()["data"]["status"] == "INACTIVE"
    
    # Activate
    act_res = client.post(f"/api/v1/admin/games/{game_id}/activate", headers=headers)
    assert act_res.status_code == 200
    assert act_res.json()["data"]["status"] == "ACTIVE"

def test_user_catalog_returns_active_games_only(client, auth_headers, super_admin_headers):
    user_headers, user = auth_headers
    admin_headers, admin = super_admin_headers
    
    # Create inactive game
    data = {
        "name": "Hidden Game",
        "slug": f"hidden-game-{uuid4().hex[:6]}",
        "game_type": "TEST",
        "min_bet": 1000,
        "max_bet": 100000
    }
    create_res = client.post("/api/v1/admin/games", json=data, headers=admin_headers)
    game_id = create_res.json()["data"]["id"]
    client.post(f"/api/v1/admin/games/{game_id}/deactivate", headers=admin_headers)
    
    # Fetch catalog
    # Wait, the catalog doesn't strictly need auth based on the route definition, but let's test it
    res = client.get("/api/v1/games/catalog")
    assert res.status_code == 200
    
    games = res.json()["data"]
    slugs = [g["slug"] for g in games]
    assert data["slug"] not in slugs

def test_colour_prediction_record_exists(client, db: Session):
    # Test DB setup uses Base.metadata.create_all and skips Alembic seed. 
    # Seed it manually if not exists for the test suite.
    from app.models.game_catalog import Game, GameStatus
    cp = db.query(Game).filter(Game.slug == "colour-prediction").first()
    if not cp:
        cp = Game(
            name="Colour Prediction",
            slug="colour-prediction",
            game_type="COLOUR_PREDICTION",
            description="Colour prediction game",
            status=GameStatus.ACTIVE,
            min_bet=1000,
            max_bet=100000
        )
        db.add(cp)
    cp.status = GameStatus.ACTIVE
    db.commit()

    # Check catalog for initial seed
    res = client.get("/api/v1/games/catalog")
    assert res.status_code == 200
    games = res.json()["data"]
    
    cp_exists = any(g["slug"] == "colour-prediction" for g in games)
    assert cp_exists is True
