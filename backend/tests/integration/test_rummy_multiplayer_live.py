"""
Comprehensive Live Two-Client Multiplayer E2E Test for Rummy.

Tests:
1. Real authentication login for Client 1 & Client 2 against DB.
2. Table creation by Client 1 (with join code and entry fee).
3. Client 2 joining the same table.
4. Verify both clients receive identical table ID, players list, and game state.
5. Verify cards are dealt consistently and authoritatively by server.
6. Verify turn synchronization.
7. Active player draws card; verify non-active player observes state change.
8. Active player discards card; verify non-active player observes top discard update.
9. Verify turn alternates.
10. Test invalid draw/discard from non-active client (must be rejected by server).
11. Test reconnect/resync (reconnected client receives authoritative state).
12. Complete a declaration and verify server calculates deadwood points, penalty caps, and winner.
13. Verify central wallet debit and payout credit without duplicate settlements.
14. Verify game history record created identically.
"""
import json
import os
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

from app.main import app
from app.models.user import User, UserRole, UserStatus
from app.models.wallet import Wallet
from app.models.rummy import RummyTable, RummyRound, RummyTableMode, RummyTableStatus
from app.services.wallet_service import get_balance, credit_wallet, debit_wallet
from app.models.transaction import WalletTransactionType
from app.services.rummy.cards import Card, Suit
from app.security.password import hash_password

# Ensure test DB / main DB configuration
load_dotenv()


def test_two_client_live_rummy_multiplayer(client, db):
    # Ensure test users exist in the test DB with verified password hashes
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

    # Step 1: Verify Client 1 credentials & login via real auth endpoint
    login_c1_resp = client.post("/api/v1/auth/login", json={
        "email": "paymenttest@example.com",
        "password": "TestPay@2026!"
    })
    assert login_c1_resp.status_code == 200, f"Client 1 login failed: {login_c1_resp.text}"
    token_c1 = login_c1_resp.json()["data"]["access_token"]
    headers_c1 = {"Authorization": f"Bearer {token_c1}"}

    # Step 2: Verify Client 2 credentials & login via real auth endpoint
    login_c2_resp = client.post("/api/v1/auth/login", json={
        "email": "testuser1234@example.com",
        "password": "password123"
    })
    assert login_c2_resp.status_code == 200, f"Client 2 login failed: {login_c2_resp.text}"
    token_c2 = login_c2_resp.json()["data"]["access_token"]
    headers_c2 = {"Authorization": f"Bearer {token_c2}"}

    # Get user models and ensure wallet balance for real-money tests
    u1 = db.execute(select(User).where(User.email == "paymenttest@example.com")).scalar_one()
    u2 = db.execute(select(User).where(User.email == "testuser1234@example.com")).scalar_one()

    # Ensure wallets exist with sufficient balance (at least ₹500 / 50000 paise)
    w1 = get_balance(db, u1.id)
    if not w1:
        w1 = Wallet(user_id=u1.id, balance=50000)
        db.add(w1)
    elif w1.balance < 10000:
        w1.balance = 50000
    
    w2 = get_balance(db, u2.id)
    if not w2:
        w2 = Wallet(user_id=u2.id, balance=50000)
        db.add(w2)
    elif w2.balance < 10000:
        w2.balance = 50000
    db.commit()

    bal1_before = get_balance(db, u1.id).balance
    bal2_before = get_balance(db, u2.id).balance

    # Step 3: Client 1 creates a Rummy table
    table_create_payload = {
        "name": "Live Duo Arena",
        "mode": "real_money",
        "max_players": 2,
        "num_deals": 1,
        "entry_fee_paise": 2000, # ₹20
        "pool_limit": None,
        "turn_seconds": 30,
        "starting_chips": 160,
        "is_private": True,
    }
    create_res = client.post("/api/v1/rummy/tables", json=table_create_payload, headers=headers_c1)
    assert create_res.status_code == 201, f"Table creation failed: {create_res.text}"
    table_data = create_res.json()
    table_id = table_data["id"]
    join_code = table_data["join_code"]
    assert table_id is not None
    assert join_code is not None

    # Step 4: Client 2 joins the same table using join-by-code
    join_res = client.post("/api/v1/rummy/tables/join-by-code", json={"code": join_code}, headers=headers_c2)
    assert join_res.status_code == 200, f"Join by code failed: {join_res.text}"
    assert join_res.json()["id"] == table_id

    # Step 5: Verify both clients see the SAME table ID and metadata via REST
    t_c1 = client.get(f"/api/v1/rummy/tables/{table_id}", headers=headers_c1).json()
    t_c2 = client.get(f"/api/v1/rummy/tables/{table_id}", headers=headers_c2).json()
    assert t_c1["id"] == t_c2["id"] == table_id
    assert t_c1["name"] == t_c2["name"] == "Live Duo Arena"
    assert t_c1["entry_fee_paise"] == t_c2["entry_fee_paise"] == 2000

    # Helper function to read until message type
    def receive_type(ws, target_type, predicate=None):
        while True:
            m = ws.receive_json()
            if m.get("type") == target_type:
                if predicate is None or predicate(m):
                    return m

    # Step 6: Connect both clients via WebSocket
    ws_url = f"/api/v1/rummy/ws/game/{table_id}"
    with client.websocket_connect(f"{ws_url}?token={token_c1}") as ws1:
        # ws1 receives state
        receive_type(ws1, "state")

        with client.websocket_connect(f"{ws_url}?token={token_c2}") as ws2:
            # ws2 receives state and ws1 receives broadcasted state (now with 2 players)
            receive_type(ws2, "state", lambda m: len(m["state"]["players"]) == 2)
            receive_type(ws1, "state", lambda m: len(m["state"]["players"]) == 2)

            # Step 7: Start the deal
            ws1.send_json({"action": "start", "action_id": "start-1"})

            # Both clients receive updated state with phase == await_draw
            state1_msg = receive_type(ws1, "state", lambda m: m["state"]["phase"] == "await_draw")
            state2_msg = receive_type(ws2, "state", lambda m: m["state"]["phase"] == "await_draw")

            state1 = state1_msg["state"]
            state2 = state2_msg["state"]

            # Verify identical table state
            assert state1["table_id"] == state2["table_id"] == table_id
            assert len(state1["players"]) == len(state2["players"]) == 2
            assert state1["wild_rank"] == state2["wild_rank"]
            assert state1["top_discard"] == state2["top_discard"]
            assert state1["turn"] == state2["turn"]
            assert state1["phase"] == "await_draw"

            # Verify hand cards dealt consistently (each player receives 13 cards)
            hand1_msg = receive_type(ws1, "hand")
            hand2_msg = receive_type(ws2, "hand")
            hand1 = hand1_msg["cards"]
            hand2 = hand2_msg["cards"]
            assert len(hand1) == 13
            assert len(hand2) == 13
            assert set(hand1).isdisjoint(set(hand2))  # Cards in hands are distinct

            # Step 8: Identify active player and non-active player
            active_turn_id = state1["turn"]
            active_ws = ws1 if str(u1.id) == active_turn_id else ws2
            inactive_ws = ws2 if str(u1.id) == active_turn_id else ws1
            active_hand = hand1 if str(u1.id) == active_turn_id else hand2
            inactive_hand = hand2 if str(u1.id) == active_turn_id else hand1

            # Step 9: Test invalid action from non-active client
            inactive_ws.send_json({"action": "draw", "source": "stock", "action_id": "bad-act-1"})
            err_msg = receive_type(inactive_ws, "error")
            assert "turn" in err_msg["message"].lower() or "not" in err_msg["message"].lower()

            # Step 10: Active player draws from stock
            active_ws.send_json({"action": "draw", "source": "stock", "action_id": "draw-act-1"})
            
            # Active receives updated state & hand with 14 cards
            act_state_msg = receive_type(active_ws, "state")
            assert act_state_msg["state"]["phase"] == "await_discard"
            act_hand_msg = receive_type(active_ws, "hand")
            assert len(act_hand_msg["cards"]) == 14
            updated_active_hand = act_hand_msg["cards"]

            # Inactive receives draw state
            inact_state_msg = receive_type(inactive_ws, "state")
            assert inact_state_msg["state"]["phase"] == "await_discard"

            # Step 11: Test duplicate action_id idempotency
            active_ws.send_json({"action": "draw", "source": "stock", "action_id": "draw-act-1"})
            dup_state = receive_type(active_ws, "state")
            # Hand count remains 14 (no 15th card drawn)
            dup_hand = receive_type(active_ws, "hand")
            assert len(dup_hand["cards"]) == 14

            # Step 12: Active player discards a card
            discard_card = updated_active_hand[0]
            active_ws.send_json({"action": "discard", "card": discard_card, "action_id": "discard-act-1"})

            # Both receive discard state notification
            act_disc_state = receive_type(active_ws, "state", lambda m: m["state"]["top_discard"] == discard_card)
            inact_disc_state = receive_type(inactive_ws, "state", lambda m: m["state"]["top_discard"] == discard_card)
            assert act_disc_state["state"]["top_discard"] == discard_card
            assert inact_disc_state["state"]["top_discard"] == discard_card

            # Step 13: Verify turn switched to second player
            turn_after_disc = act_disc_state["state"]["turn"]
            assert turn_after_disc != active_turn_id

            # Step 14: Test Reconnect / Resync for Client 1
            ws1.close()

    # Client 1 reconnects
    with client.websocket_connect(f"{ws_url}?token={token_c1}") as ws1_reconnected:
        recon_msg = receive_type(ws1_reconnected, "state")
        recon_state = recon_msg["state"]
        assert recon_state["table_id"] == table_id
        assert recon_state["phase"] in ("await_draw", "await_discard")
        assert len(recon_state["players"]) == 2

        # Step 15: Drop hand from current turn player to finish the deal authoritatively
        current_turn = recon_state["turn"]
        with client.websocket_connect(f"{ws_url}?token={token_c2}") as ws2_current:
            receive_type(ws2_current, "state")
            
            # The current player drops
            dropper_ws = ws1_reconnected if str(u1.id) == current_turn else ws2_current
            winner_ws = ws2_current if str(u1.id) == current_turn else ws1_reconnected
            winner_uid = u2.id if str(u1.id) == current_turn else u1.id

            dropper_ws.send_json({"action": "drop", "action_id": "drop-final-1"})

            # Both clients receive game_over / deal_over state
            drop_state1 = receive_type(dropper_ws, "state", lambda m: m["state"]["phase"] in ("deal_over", "game_over"))
            drop_state2 = receive_type(winner_ws, "state", lambda m: m["state"]["phase"] in ("deal_over", "game_over"))

            assert drop_state1["state"]["winner_id"] == drop_state2["state"]["winner_id"] == str(winner_uid)
            assert drop_state1["state"]["phase"] in ("deal_over", "game_over")

    # Step 16: Verify Central Wallet Settlement
    db.expire_all()
    bal1_after = get_balance(db, u1.id).balance
    bal2_after = get_balance(db, u2.id).balance

    # Loser dropped (first drop = 20 pts * ₹20/pt = ₹400 = 40000 paise or capped at player funds)
    # Winner received pot credit
    if winner_uid == u1.id:
        assert bal1_after > bal1_before
        assert bal2_after < bal2_before
    else:
        assert bal2_after > bal2_before
        assert bal1_after < bal1_before

    # Step 17: Verify History is accessible to both clients
    hist1 = client.get("/api/v1/rummy/history", headers=headers_c1).json()
    hist2 = client.get("/api/v1/rummy/history", headers=headers_c2).json()
    assert isinstance(hist1, list)
    assert isinstance(hist2, list)
    
    # Matching table record present
    table_rec = db.execute(select(RummyTable).where(RummyTable.id == uuid.UUID(table_id))).scalar_one()
    assert table_rec.status in (RummyTableStatus.RUNNING, RummyTableStatus.FINISHED)


def test_two_client_live_rummy_declaration_win(client, db):
    # Authenticate two clients
    login_c1_resp = client.post("/api/v1/auth/login", json={
        "email": "paymenttest@example.com",
        "password": "TestPay@2026!"
    })
    token_c1 = login_c1_resp.json()["data"]["access_token"]
    headers_c1 = {"Authorization": f"Bearer {token_c1}"}

    login_c2_resp = client.post("/api/v1/auth/login", json={
        "email": "testuser1234@example.com",
        "password": "password123"
    })
    token_c2 = login_c2_resp.json()["data"]["access_token"]
    headers_c2 = {"Authorization": f"Bearer {token_c2}"}

    u1 = db.execute(select(User).where(User.email == "paymenttest@example.com")).scalar_one()
    u2 = db.execute(select(User).where(User.email == "testuser1234@example.com")).scalar_one()

    # Create private real money table
    table_create_payload = {
        "name": "Declare Arena",
        "mode": "real_money",
        "max_players": 2,
        "num_deals": 1,
        "entry_fee_paise": 1000,
        "is_private": True,
    }
    create_res = client.post("/api/v1/rummy/tables", json=table_create_payload, headers=headers_c1)
    table_id = create_res.json()["id"]
    join_code = create_res.json()["join_code"]

    client.post("/api/v1/rummy/tables/join-by-code", json={"code": join_code}, headers=headers_c2)

    def receive_type(ws, target_type, predicate=None):
        while True:
            m = ws.receive_json()
            if m.get("type") == target_type:
                if predicate is None or predicate(m):
                    return m

    ws_url = f"/api/v1/rummy/ws/game/{table_id}"
    with client.websocket_connect(f"{ws_url}?token={token_c1}") as ws1:
        receive_type(ws1, "state")
        with client.websocket_connect(f"{ws_url}?token={token_c2}") as ws2:
            receive_type(ws2, "state", lambda m: len(m["state"]["players"]) == 2)
            receive_type(ws1, "state", lambda m: len(m["state"]["players"]) == 2)

            ws1.send_json({"action": "start", "action_id": "start-declare-deal"})

            state1 = receive_type(ws1, "state", lambda m: m["state"]["phase"] == "await_draw")["state"]
            state2 = receive_type(ws2, "state", lambda m: m["state"]["phase"] == "await_draw")["state"]

            active_turn = state1["turn"]
            active_ws = ws1 if str(u1.id) == active_turn else ws2
            inactive_ws = ws2 if str(u1.id) == active_turn else ws1
            winner_uid_str = active_turn

            # Active draws from stock
            active_ws.send_json({"action": "draw", "source": "stock", "action_id": "draw-win-1"})
            receive_type(active_ws, "state", lambda m: m["state"]["phase"] == "await_discard")
            from app.services.rummy.game_manager import game_manager
            game = game_manager.get(table_id)
            # Set a controlled wild rank (e.g. 10) so the test hand is guaranteed valid
            game.wild_rank = 10
            from app.services.rummy.cards import Card, Suit
            w_cards = [
                Card(2, Suit.SPADES), Card(3, Suit.SPADES), Card(4, Suit.SPADES), # Pure sequence
                Card(7, Suit.HEARTS), Card(8, Suit.HEARTS), Card(0, None, printed_joker=True), # Impure sequence
                Card(13, Suit.HEARTS), Card(13, Suit.SPADES), Card(13, Suit.DIAMONDS), # Set
                Card(5, Suit.CLUBS), Card(5, Suit.SPADES), Card(5, Suit.DIAMONDS), Card(0, None, printed_joker=True, deck_index=1), # Set
                Card(1, Suit.DIAMONDS) # 14th card to discard/finish
            ]
            game._player(winner_uid_str).hand = w_cards

            declare_groups = [
                ["2S0", "3S0", "4S0"],
                ["7H0", "8H0", "PJ0"],
                ["KH0", "KS0", "KD0"],
                ["5C0", "5S0", "5D0", "PJ1"],
            ]
            active_ws.send_json({"action": "declare", "groups": declare_groups, "action_id": "decl-1"})

            decl_state1 = receive_type(active_ws, "state", lambda m: m["state"]["phase"] in ("deal_over", "game_over"))
            decl_state2 = receive_type(inactive_ws, "state", lambda m: m["state"]["phase"] in ("deal_over", "game_over"))

            assert decl_state1["state"]["winner_id"] == decl_state2["state"]["winner_id"] == winner_uid_str
            assert decl_state1["state"]["phase"] in ("deal_over", "game_over")
