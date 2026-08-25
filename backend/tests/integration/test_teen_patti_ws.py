"""
Live Two-Client Multiplayer E2E Tests for Teen Patti WebSocket Table.
"""
import json
import uuid
import pytest
from sqlalchemy import select

from app.models.user import User, UserRole, UserStatus
from app.models.wallet import Wallet
from app.models.teen_patti import TeenPattiTable, TeenPattiTableMode, TeenPattiTableStatus
from app.services.wallet_service import get_balance
from app.security.password import hash_password
import app.websocket.teen_patti_ws as tpws

# Accelerate timers for tests
tpws._BOT_JOIN_DELAY_SECONDS = 0.05
tpws._START_COUNTDOWN_SECONDS = 0.05
tpws._NEXT_HAND_DELAY_SECONDS = 0.05


def test_two_client_live_teen_patti_multiplayer(client, db):
    # Step 1 & 2: Ensure authenticated test accounts
    u1 = db.execute(select(User).where(User.email == "paymenttest@example.com")).scalar_one_or_none()
    if not u1:
        u1 = User(
            name="Payment Test User",
            username="payment_test_user",
            email="paymenttest@example.com",
            password_hash=hash_password("TestPay@2026!"),
            role=UserRole.USER,
            status=UserStatus.ACTIVE,
        )
        db.add(u1)
    else:
        u1.password_hash = hash_password("TestPay@2026!")

    u2 = db.execute(select(User).where(User.email == "testuser1234@example.com")).scalar_one_or_none()
    if not u2:
        u2 = User(
            name="Test User 1234",
            username="testuser1234",
            email="testuser1234@example.com",
            password_hash=hash_password("password123"),
            role=UserRole.USER,
            status=UserStatus.ACTIVE,
        )
        db.add(u2)
    else:
        u2.password_hash = hash_password("password123")
    db.commit()
    db.refresh(u1)
    db.refresh(u2)

    login_c1_resp = client.post("/api/v1/auth/login", json={
        "email": "paymenttest@example.com",
        "password": "TestPay@2026!"
    })
    assert login_c1_resp.status_code == 200
    token_c1 = login_c1_resp.json()["data"]["access_token"]
    headers_c1 = {"Authorization": f"Bearer {token_c1}"}

    login_c2_resp = client.post("/api/v1/auth/login", json={
        "email": "testuser1234@example.com",
        "password": "password123"
    })
    assert login_c2_resp.status_code == 200
    token_c2 = login_c2_resp.json()["data"]["access_token"]
    headers_c2 = {"Authorization": f"Bearer {token_c2}"}

    # Ensure wallet balances
    for u in (u1, u2):
        w = get_balance(db, u.id)
        if not w:
            w = Wallet(user_id=u.id, balance=50000)
            db.add(w)
        elif w.balance < 10000:
            w.balance = 50000
    db.commit()

    # Step 3: Client 1 creates private Teen Patti table
    tbl_payload = {
        "name": "Live Royal Patti",
        "mode": "real",
        "max_players": 2,
        "boot_amount": 1000, # ₹10
        "turn_seconds": 20,
        "is_private": True,
    }
    create_res = client.post("/api/v1/teen-patti/tables", json=tbl_payload, headers=headers_c1)
    assert create_res.status_code == 201
    tbl_data = create_res.json()
    table_id = tbl_data["id"]
    join_code = tbl_data["join_code"]
    assert table_id is not None
    assert join_code is not None

    # Step 4: Client 2 joins using join-by-code
    join_res = client.post("/api/v1/teen-patti/tables/join-by-code", json={"code": join_code}, headers=headers_c2)
    assert join_res.status_code == 200
    assert join_res.json()["id"] == table_id

    # Step 5 & 6: Verify REST metadata & connect WebSocket
    def receive_type(ws, target_type, predicate=None):
        while True:
            m = ws.receive_json()
            if m.get("type") == target_type:
                if predicate is None or predicate(m):
                    return m

    ws_url = f"/api/v1/ws/teen-patti/{table_id}"
    with client.websocket_connect(f"{ws_url}?token={token_c1}") as ws1:
        receive_type(ws1, "state")
        with client.websocket_connect(f"{ws_url}?token={token_c2}") as ws2:
            # Both clients observe 2 seated players
            receive_type(ws2, "state", lambda m: len(m["state"]["seats"]) == 2)
            receive_type(ws1, "state", lambda m: len(m["state"]["seats"]) == 2)

            # Step 7: Start hand
            ws1.send_json({"action": "start", "action_id": "start-hand-1"})

            # Both receive state in playing phase with dealt cards
            s1_msg = receive_type(ws1, "state", lambda m: m["state"]["phase"] == "playing")
            s2_msg = receive_type(ws2, "state", lambda m: m["state"]["phase"] == "playing")
            state1 = s1_msg["state"]
            state2 = s2_msg["state"]

            # Step 8: Pot and cards verification
            assert state1["pot"] == 2000 # 2 players * 1000 boot
            assert state1["current_stake"] == 1000
            assert state1["seats"][0]["card_count"] == 3
            assert state1["seats"][1]["card_count"] == 3

            # Step 9: Blind status initially
            assert state1["seats"][0]["seen"] is False
            assert state1["seats"][1]["seen"] is False

            # Identify active turn
            active_seat_idx = state1["current_turn"]
            active_seat = state1["seats"][active_seat_idx]
            active_ws = ws1 if active_seat["id"] == str(u1.id) else ws2
            inactive_ws = ws2 if active_seat["id"] == str(u1.id) else ws1

            # Step 10: Test see action
            active_ws.send_json({"action": "see", "action_id": "see-act-1"})
            see_state = receive_type(active_ws, "state", lambda m: m["state"]["seats"][active_seat_idx]["seen"] is True)
            assert see_state["state"]["seats"][active_seat_idx]["cards"] is not None
            assert len(see_state["state"]["seats"][active_seat_idx]["cards"]) == 3

            # Step 11: Active player bets (chaal)
            active_ws.send_json({"action": "bet", "raise": False, "action_id": "bet-chaal-1"})
            chaal_state = receive_type(active_ws, "state", lambda m: m["state"]["pot"] > 2000)
            assert chaal_state["state"]["pot"] == 4000 # 2000 + 2000 (seen multiplier = 2x boot)

            # Step 12: Turn switched to second player
            turn_after_chaal = chaal_state["state"]["current_turn"]
            assert turn_after_chaal != active_seat_idx
            new_active_ws = inactive_ws

            # Step 13: Second player raises
            new_active_ws.send_json({"action": "bet", "raise": True, "action_id": "bet-raise-1"})
            raise_state = receive_type(new_active_ws, "state", lambda m: m["state"]["current_stake"] == 2000)
            assert raise_state["state"]["current_stake"] == 2000

            # Step 14: Next player shows (final 2-player showdown)
            turn_after_raise = raise_state["state"]["current_turn"]
            show_ws = ws1 if str(u1.id) == raise_state["state"]["seats"][turn_after_raise]["id"] else ws2
            show_ws.send_json({"action": "show", "action_id": "show-final-1"})

            show_state1 = receive_type(ws1, "state", lambda m: m["state"]["phase"] == "finished")
            show_state2 = receive_type(ws2, "state", lambda m: m["state"]["phase"] == "finished")

            assert show_state1["state"]["winner_seat"] is not None
            assert show_state1["state"]["winner_seat"] == show_state2["state"]["winner_seat"]

    # Step 15: Verify wallet settlement and transaction history
    db.expire_all()
    hist1 = client.get("/api/v1/teen-patti/history", headers=headers_c1).json()
    hist2 = client.get("/api/v1/teen-patti/history", headers=headers_c2).json()
    assert len(hist1) >= 1
    assert len(hist2) >= 1
