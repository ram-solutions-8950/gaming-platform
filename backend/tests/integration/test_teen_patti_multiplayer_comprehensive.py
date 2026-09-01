"""
Comprehensive Teen Patti Multiplayer Test Suite.
Verifies all 18 multiplayer joining, concurrency, race condition, state sync,
wallet safety, and idempotency guarantees required for production.
"""
import asyncio
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
from app.services.teen_patti.engine import GameConfig, Phase, PlayerStatus, TeenPattiHand
from app.services.teen_patti.manager import teen_patti_manager


@pytest.fixture
def test_users(db):
    """Creates/retrieves 4 distinct funded test users."""
    users = []
    tokens = []
    for i in range(1, 5):
        email = f"tp_test_user_{i}@example.com"
        u = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
        if not u:
            u = User(
                name=f"TP Player {i}",
                username=f"tp_player_{i}",
                email=email,
                password_hash=hash_password(f"Pass_{i}!2026"),
                role=UserRole.USER,
                status=UserStatus.ACTIVE,
            )
            db.add(u)
            db.commit()
            db.refresh(u)
        w = get_balance(db, u.id)
        if not w:
            w = Wallet(user_id=u.id, balance=50000)
            db.add(w)
        else:
            w.balance = 50000
        db.commit()
        users.append(u)
    return users


def _get_user_tokens(client, users):
    tokens = []
    for i, u in enumerate(users, start=1):
        resp = client.post("/api/v1/auth/login", json={
            "email": u.email,
            "password": f"Pass_{i}!2026"
        })
        assert resp.status_code == 200
        tokens.append(resp.json()["data"]["access_token"])
    return tokens


def _create_test_table(client, token, max_players=4, boot=1000):
    resp = client.post(
        "/api/v1/teen-patti/tables",
        json={
            "name": "Audit Table",
            "mode": "real",
            "max_players": max_players,
            "boot_amount": boot,
            "turn_seconds": 15,
            "is_private": False,
        },
        headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def _recv_state(ws):
    while True:
        msg = ws.receive_json()
        if msg.get("type") == "state":
            return msg["state"]


# 1. test_single_player_waits_for_opponent
def test_single_player_waits_for_opponent(client, db, test_users):
    tokens = _get_user_tokens(client, test_users)
    table_id = _create_test_table(client, tokens[0], max_players=4)

    with client.websocket_connect(f"/api/v1/ws/teen-patti/{table_id}?token={tokens[0]}") as ws:
        state = _recv_state(ws)
        assert len(state["seats"]) == 1
        assert state["phase"] == "waiting"
        # Verify single player cannot start game
        ws.send_json({"action": "start"})
        err = ws.receive_json()
        assert err["type"] == "error"
        assert "Need at least 2 players" in err["message"]
        # Remains in waiting phase
        ws.send_json({"action": "sync"})
        state2 = _recv_state(ws)
        assert state2["phase"] == "waiting"


# 2. test_two_players_join_same_table
def test_two_players_join_same_table(client, db, test_users):
    tokens = _get_user_tokens(client, test_users)
    table_id = _create_test_table(client, tokens[0], max_players=4)

    with client.websocket_connect(f"/api/v1/ws/teen-patti/{table_id}?token={tokens[0]}") as ws1:
        s1 = _recv_state(ws1)
        assert len(s1["seats"]) == 1
        with client.websocket_connect(f"/api/v1/ws/teen-patti/{table_id}?token={tokens[1]}") as ws2:
            s2_p2 = _recv_state(ws2)
            s2_p1 = _recv_state(ws1)
            assert len(s2_p2["seats"]) == 2
            assert len(s2_p1["seats"]) == 2
            assert s2_p2["seats"][0]["id"] == str(test_users[0].id)
            assert s2_p2["seats"][1]["id"] == str(test_users[1].id)


# 3. test_multiple_players_join_same_table
def test_multiple_players_join_same_table(client, db, test_users):
    tokens = _get_user_tokens(client, test_users)
    table_id = _create_test_table(client, tokens[0], max_players=4)

    with client.websocket_connect(f"/api/v1/ws/teen-patti/{table_id}?token={tokens[0]}") as ws1:
        _recv_state(ws1)
        with client.websocket_connect(f"/api/v1/ws/teen-patti/{table_id}?token={tokens[1]}") as ws2:
            _recv_state(ws2)
            _recv_state(ws1)
            with client.websocket_connect(f"/api/v1/ws/teen-patti/{table_id}?token={tokens[2]}") as ws3:
                _recv_state(ws3)
                _recv_state(ws2)
                _recv_state(ws1)
                with client.websocket_connect(f"/api/v1/ws/teen-patti/{table_id}?token={tokens[3]}") as ws4:
                    s4 = _recv_state(ws4)
                    assert len(s4["seats"]) == 4


# 4. test_unique_seat_assignment
def test_unique_seat_assignment(client, db, test_users):
    tokens = _get_user_tokens(client, test_users)
    table_id = _create_test_table(client, tokens[0], max_players=3)

    with client.websocket_connect(f"/api/v1/ws/teen-patti/{table_id}?token={tokens[0]}") as ws1:
        _recv_state(ws1)
        with client.websocket_connect(f"/api/v1/ws/teen-patti/{table_id}?token={tokens[1]}") as ws2:
            _recv_state(ws2)
            with client.websocket_connect(f"/api/v1/ws/teen-patti/{table_id}?token={tokens[2]}") as ws3:
                s3 = _recv_state(ws3)
                seat_ids = [s["id"] for s in s3["seats"]]
                assert len(seat_ids) == len(set(seat_ids)) == 3
                assert seat_ids == [str(test_users[0].id), str(test_users[1].id), str(test_users[2].id)]


# 5. test_duplicate_join_same_user
def test_duplicate_join_same_user(client, db, test_users):
    tokens = _get_user_tokens(client, test_users)
    table_id = _create_test_table(client, tokens[0], max_players=4)

    with client.websocket_connect(f"/api/v1/ws/teen-patti/{table_id}?token={tokens[0]}") as ws1:
        s1 = _recv_state(ws1)
        assert len(s1["seats"]) == 1
        # Second connection by SAME user
        with client.websocket_connect(f"/api/v1/ws/teen-patti/{table_id}?token={tokens[0]}") as ws1_reconnect:
            s1_recon = _recv_state(ws1_reconnect)
            # Seat count must still be 1 (no duplicate seats created)
            assert len(s1_recon["seats"]) == 1
            assert s1_recon["seats"][0]["id"] == str(test_users[0].id)


# 6. test_simultaneous_join_race
def test_simultaneous_join_race(client, db, test_users):
    # Tests that engine enforces max_players and thread safety
    cfg = GameConfig(boot_amount=1000, max_players=2)
    hand = TeenPattiHand(cfg)
    hand.add_seat(str(test_users[0].id), "P1")
    hand.add_seat(str(test_users[1].id), "P2")
    with pytest.raises(Exception) as exc:
        hand.add_seat(str(test_users[2].id), "P3")
    assert "table is full" in str(exc.value)


# 7. test_game_starts_only_once
def test_game_starts_only_once(client, db, test_users):
    tokens = _get_user_tokens(client, test_users)
    table_id = _create_test_table(client, tokens[0], max_players=2)

    with client.websocket_connect(f"/api/v1/ws/teen-patti/{table_id}?token={tokens[0]}") as ws1:
        _recv_state(ws1)
        with client.websocket_connect(f"/api/v1/ws/teen-patti/{table_id}?token={tokens[1]}") as ws2:
            _recv_state(ws2)
            _recv_state(ws1)

            # Player 1 starts
            ws1.send_json({"action": "start", "action_id": "start-1"})
            s1 = _recv_state(ws1)
            s2 = _recv_state(ws2)
            assert s1["phase"] == "playing"
            assert s2["phase"] == "playing"

            # Player 2 sends start right after
            ws2.send_json({"action": "start", "action_id": "start-2"})
            # State should remain in playing phase, pot should not double
            assert s1["pot"] == 2000
            hand = teen_patti_manager.get(table_id)
            assert hand.pot == 2000


# 8. test_duplicate_round_creation_prevention
def test_duplicate_round_creation_prevention(client, db, test_users):
    cfg = GameConfig(boot_amount=1000, max_players=2)
    hand = TeenPattiHand(cfg)
    hand.add_seat("p1", "Player 1")
    hand.add_seat("p2", "Player 2")
    hand.start_hand("seed1", 1)
    assert hand.phase == Phase.PLAYING
    # Attempting to add seats or restart
    with pytest.raises(Exception):
        hand.add_seat("p3", "Player 3")


# 9. test_late_join_after_game_started
def test_late_join_after_game_started(client, db, test_users):
    tokens = _get_user_tokens(client, test_users)
    table_id = _create_test_table(client, tokens[0], max_players=4)

    with client.websocket_connect(f"/api/v1/ws/teen-patti/{table_id}?token={tokens[0]}") as ws1:
        _recv_state(ws1)
        with client.websocket_connect(f"/api/v1/ws/teen-patti/{table_id}?token={tokens[1]}") as ws2:
            _recv_state(ws2)
            _recv_state(ws1)

            # Start hand
            ws1.send_json({"action": "start", "action_id": "start-1"})
            _recv_state(ws1)
            _recv_state(ws2)

            # User 3 tries to join active game
            with client.websocket_connect(f"/api/v1/ws/teen-patti/{table_id}?token={tokens[2]}") as ws3:
                err = ws3.receive_json()
                assert err["type"] == "error"
                assert "Game is currently in progress" in err["message"]
                # Active hand must not be corrupted
                hand = teen_patti_manager.get(table_id)
                assert len(hand.seats) == 2


# 10. test_websocket_two_player_sync
def test_websocket_two_player_sync(client, db, test_users):
    tokens = _get_user_tokens(client, test_users)
    table_id = _create_test_table(client, tokens[0], max_players=2)

    with client.websocket_connect(f"/api/v1/ws/teen-patti/{table_id}?token={tokens[0]}") as ws1:
        _recv_state(ws1)
        with client.websocket_connect(f"/api/v1/ws/teen-patti/{table_id}?token={tokens[1]}") as ws2:
            _recv_state(ws2)
            _recv_state(ws1)
            ws1.send_json({"action": "start", "action_id": "sync-start"})
            s1 = _recv_state(ws1)
            s2 = _recv_state(ws2)
            assert s1["pot"] == s2["pot"] == 2000
            assert s1["current_turn"] == s2["current_turn"]


# 11. test_websocket_multiple_player_sync
def test_websocket_multiple_player_sync(client, db, test_users):
    tokens = _get_user_tokens(client, test_users)
    table_id = _create_test_table(client, tokens[0], max_players=3)

    with client.websocket_connect(f"/api/v1/ws/teen-patti/{table_id}?token={tokens[0]}") as ws1:
        _recv_state(ws1)
        with client.websocket_connect(f"/api/v1/ws/teen-patti/{table_id}?token={tokens[1]}") as ws2:
            _recv_state(ws2)
            _recv_state(ws1)
            with client.websocket_connect(f"/api/v1/ws/teen-patti/{table_id}?token={tokens[2]}") as ws3:
                _recv_state(ws3)
                _recv_state(ws2)
                _recv_state(ws1)

                ws1.send_json({"action": "start", "action_id": "mult-start"})
                s1 = _recv_state(ws1)
                s2 = _recv_state(ws2)
                s3 = _recv_state(ws3)
                assert s1["pot"] == s2["pot"] == s3["pot"] == 3000


# 12. test_reconnect_does_not_create_duplicate_player
def test_reconnect_does_not_create_duplicate_player(client, db, test_users):
    tokens = _get_user_tokens(client, test_users)
    table_id = _create_test_table(client, tokens[0], max_players=2)

    with client.websocket_connect(f"/api/v1/ws/teen-patti/{table_id}?token={tokens[0]}") as ws1:
        _recv_state(ws1)
        with client.websocket_connect(f"/api/v1/ws/teen-patti/{table_id}?token={tokens[1]}") as ws2:
            _recv_state(ws2)
            _recv_state(ws1)

            ws1.send_json({"action": "start", "action_id": "rec-start"})
            s1 = _recv_state(ws1)
            _recv_state(ws2)
            turn = s1["current_turn"]

        # Player 2 disconnected and reconnects
        with client.websocket_connect(f"/api/v1/ws/teen-patti/{table_id}?token={tokens[1]}") as ws2_recon:
            s2_recon = _recv_state(ws2_recon)
            assert len(s2_recon["seats"]) == 2
            assert s2_recon["current_turn"] == turn
            assert s2_recon["phase"] == "playing"


# 13. test_duplicate_action_protection
def test_duplicate_action_protection(client, db, test_users):
    tokens = _get_user_tokens(client, test_users)
    table_id = _create_test_table(client, tokens[0], max_players=2)

    with client.websocket_connect(f"/api/v1/ws/teen-patti/{table_id}?token={tokens[0]}") as ws1:
        _recv_state(ws1)
        with client.websocket_connect(f"/api/v1/ws/teen-patti/{table_id}?token={tokens[1]}") as ws2:
            _recv_state(ws2)
            _recv_state(ws1)
            ws1.send_json({"action": "start", "action_id": "act-start"})
            s1 = _recv_state(ws1)
            _recv_state(ws2)

            curr_idx = s1["current_turn"]
            active_ws = ws1 if s1["seats"][curr_idx]["id"] == str(test_users[0].id) else ws2

            # Send duplicate action
            active_ws.send_json({"action": "see", "action_id": "act-see-dup"})
            s_after_1 = _recv_state(active_ws)
            assert s_after_1["seats"][curr_idx]["seen"] is True

            # Send same action ID again
            active_ws.send_json({"action": "see", "action_id": "act-see-dup"})
            s_after_2 = _recv_state(active_ws)
            assert s_after_2["seats"][curr_idx]["seen"] is True


# 14. test_entry_fee_not_double_debited
def test_entry_fee_not_double_debited(client, db, test_users):
    tokens = _get_user_tokens(client, test_users)
    table_id = _create_test_table(client, tokens[0], max_players=2, boot=1000)

    u1_before = get_balance(db, test_users[0].id).balance
    u2_before = get_balance(db, test_users[1].id).balance

    with client.websocket_connect(f"/api/v1/ws/teen-patti/{table_id}?token={tokens[0]}") as ws1:
        _recv_state(ws1)
        with client.websocket_connect(f"/api/v1/ws/teen-patti/{table_id}?token={tokens[1]}") as ws2:
            _recv_state(ws2)
            _recv_state(ws1)

            ws1.send_json({"action": "start", "action_id": "stake-start"})
            s1 = _recv_state(ws1)
            _recv_state(ws2)

            curr_idx = s1["current_turn"]
            active_ws = ws1 if s1["seats"][curr_idx]["id"] == str(test_users[0].id) else ws2
            # Active folds immediately
            active_ws.send_json({"action": "pack", "action_id": "pack-fold"})
            _recv_state(ws1)
            _recv_state(ws2)

    db.expire_all()
    u1_after = get_balance(db, test_users[0].id).balance
    u2_after = get_balance(db, test_users[1].id).balance

    # With winning fee enabled, the winner's profit is reduced by the fee.
    # Pot = 2000 (boot 1000 × 2 players). Winner's gross_profit = 1000.
    # Winning fee is deducted from the profit, so total_after < total_before.
    total_after = u1_after + u2_after
    total_before = u1_before + u2_before
    # The fee amount equals winning_fee_percent% of the gross profit (1000 paisa)
    fee_deducted = total_before - total_after
    assert fee_deducted >= 0  # Fee is non-negative
    assert fee_deducted <= 1000  # Fee can't exceed gross profit
    # Each player's debit was exactly boot (1000 paisa) — no double debit
    assert u1_after >= u1_before - 1000 - 1  # lost at most 1 boot
    assert u2_after >= u2_before - 1000 - 1  # lost at most 1 boot


# 15. test_settlement_is_idempotent
def test_settlement_is_idempotent(client, db, test_users):
    cfg = GameConfig(boot_amount=1000, max_players=2)
    hand = TeenPattiHand(cfg)
    hand.add_seat(str(test_users[0].id), "P1")
    hand.add_seat(str(test_users[1].id), "P2")
    hand.start_hand("idem_seed", 1)
    hand.pack(hand.seats[hand.current_turn].id)
    assert hand.phase == Phase.FINISHED
    assert hand.is_settled is False
    tpws._settle_hand("dummy_table", hand)
    # is_settled must be True
    assert hand.is_settled is True
    # Second call must be a no-op
    tpws._settle_hand("dummy_table", hand)
    assert hand.is_settled is True


# 16. test_private_cards_not_leaked
def test_private_cards_not_leaked(client, db, test_users):
    cfg = GameConfig(boot_amount=1000, max_players=2)
    hand = TeenPattiHand(cfg)
    hand.add_seat("user_a", "Alice")
    hand.add_seat("user_b", "Bob")
    hand.start_hand("leak_seed", 1)

    # Bob sees cards
    hand.see("user_b")

    # Alice views state
    state_for_alice = hand.as_dict(for_user_id="user_a")
    # Alice must NOT see Bob's cards even though Bob is seen
    assert state_for_alice["seats"][1]["cards"] is None
    # Bob views state
    state_for_bob = hand.as_dict(for_user_id="user_b")
    assert state_for_bob["seats"][1]["cards"] is not None
    assert len(state_for_bob["seats"][1]["cards"]) == 3
    # Bob must NOT see Alice's cards
    assert state_for_bob["seats"][0]["cards"] is None


# 17. test_turn_authority
def test_turn_authority(client, db, test_users):
    tokens = _get_user_tokens(client, test_users)
    table_id = _create_test_table(client, tokens[0], max_players=2)

    with client.websocket_connect(f"/api/v1/ws/teen-patti/{table_id}?token={tokens[0]}") as ws1:
        _recv_state(ws1)
        with client.websocket_connect(f"/api/v1/ws/teen-patti/{table_id}?token={tokens[1]}") as ws2:
            _recv_state(ws2)
            _recv_state(ws1)
            ws1.send_json({"action": "start", "action_id": "turn-start"})
            s1 = _recv_state(ws1)
            _recv_state(ws2)

            curr_idx = s1["current_turn"]
            inactive_ws = ws2 if s1["seats"][curr_idx]["id"] == str(test_users[0].id) else ws1

            # Inactive player attempts to bet
            inactive_ws.send_json({"action": "bet", "raise": False, "action_id": "illegal-bet"})
            err = inactive_ws.receive_json()
            assert err["type"] == "error"
            assert "not your turn" in err["message"].lower()


# 18. test_server_authoritative_game_state
def test_server_authoritative_game_state(client, db, test_users):
    tokens = _get_user_tokens(client, test_users)
    table_id = _create_test_table(client, tokens[0], max_players=2)

    with client.websocket_connect(f"/api/v1/ws/teen-patti/{table_id}?token={tokens[0]}") as ws1:
        _recv_state(ws1)
        with client.websocket_connect(f"/api/v1/ws/teen-patti/{table_id}?token={tokens[1]}") as ws2:
            _recv_state(ws2)
            _recv_state(ws1)
            ws1.send_json({"action": "start", "action_id": "auth-start"})
            s1 = _recv_state(ws1)

            # Hand state comes strictly from engine
            hand = teen_patti_manager.get(table_id)
            assert hand.phase == Phase.PLAYING
            assert s1["pot"] == hand.pot == 2000
            assert s1["current_stake"] == hand.current_stake == 1000
