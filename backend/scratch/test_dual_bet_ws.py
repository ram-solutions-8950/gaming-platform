import asyncio
import json
import uuid
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient
from sqlalchemy import select
from app.main import app
from app.database import SessionLocal
from app.models.user import User, UserRole, UserStatus
from app.models.wallet import Wallet
from app.security.password import hash_password

def run_test():
    db = SessionLocal()
    try:
        u = db.execute(select(User).where(User.email == "aviator_test_user@example.com")).scalar_one_or_none()
        if not u:
            u = User(
                id=uuid.uuid4(),
                name="Aviator Test",
                username=f"aviator_{uuid.uuid4().hex[:6]}",
                email="aviator_test_user@example.com",
                password_hash=hash_password("Pass123!"),
                role=UserRole.USER,
                status=UserStatus.ACTIVE,
            )
            db.add(u)
            db.flush()
            w = Wallet(id=uuid.uuid4(), user_id=u.id, balance=500_000) # ₹5,000
            db.add(w)
            db.commit()
            db.refresh(u)
        else:
            w = db.execute(select(Wallet).where(Wallet.user_id == u.id)).scalar_one_or_none()
            if w:
                w.balance = 500_000
                db.commit()
    finally:
        db.close()

    with TestClient(app) as client:
        # Login
        login_resp = client.post("/api/v1/auth/login", json={
            "email": "aviator_test_user@example.com",
            "password": "Pass123!"
        })
        print("Login response:", login_resp.status_code, login_resp.json())
        token = login_resp.json()["data"]["access_token"]

        print("Connecting WebSocket...")
        with client.websocket_connect(f"/api/v1/aviator/ws?token={token}") as ws:
            # First message is sync or round_start
            msg1 = ws.receive_json()
            print("Received 1:", msg1)

            # Place bet 1
            ws.send_json({"action": "place_bet", "slot": 1, "amount": 1000, "action_id": "bet1"})
            print("Sent bet 1")

            # Place bet 2
            ws.send_json({"action": "place_bet", "slot": 2, "amount": 1000, "action_id": "bet2"})
            print("Sent bet 2")

            for _ in range(10):
                resp = ws.receive_json()
                print("Received:", resp)
                if resp.get("type") == "error":
                    print("ERROR ENCOUNTERED:", resp)

if __name__ == "__main__":
    run_test()

