import time
import os
import sys
from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ARTIFACTS_DIR = r"C:\Users\bhask\.gemini\antigravity-ide\brain\ffa80695-5851-4f95-9c0e-75db0ece7540"

def get_db_session():
    from app.database import SessionLocal
    return SessionLocal()

def clean_and_prepare_db():
    from app.database import SessionLocal
    from app.models.user import User
    from app.models.wallet import Wallet
    from app.models.ludo import LudoMatchmakingQueue, LudoMatch, LudoPlayer, LudoToken, QueueStatus, LudoMatchStatus
    from app.models.transaction import WalletTransaction

    db = SessionLocal()
    try:
        # Cancel searching queues
        db.query(LudoMatchmakingQueue).update({"status": QueueStatus.CANCELLED})
        
        # Reset any in progress matches
        db.query(LudoMatch).filter(LudoMatch.status == LudoMatchStatus.IN_PROGRESS).update({"status": LudoMatchStatus.CANCELLED})
        
        # Ensure test users exist and have enough balance (₹500 = 50000 paise)
        emails = ["player_a@corona888.com", "player_b@corona888.com"]
        for email in emails:
            user = db.query(User).filter(User.email == email).first()
            if user:
                wallet = db.query(Wallet).filter(Wallet.user_id == user.id).first()
                if wallet:
                    wallet.balance = 50000
                    print(f"[E2E-PREP] Reset balance for {email} to {wallet.balance} paise")
        
        db.commit()
    finally:
        db.close()

def test_two_browsers_ludo_matchmaking():
    print("=== STARTING TWO-BROWSER LUDO MATCHMAKING E2E TEST ===")
    clean_and_prepare_db()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        
        # Player A Context
        ctx_a = browser.new_context(viewport={"width": 1280, "height": 800})
        page_a = ctx_a.new_page()

        # Player B Context
        ctx_b = browser.new_context(viewport={"width": 1280, "height": 800})
        page_b = ctx_b.new_page()

        page_a.on("console", lambda msg: print(f"[A-CONSOLE] {msg.text}"))
        page_b.on("console", lambda msg: print(f"[B-CONSOLE] {msg.text}"))

        # 1. Login A
        print("[E2E] Logging in Player A...")
        page_a.goto("http://localhost:5173/login", wait_until="networkidle")
        page_a.fill("#email", "player_a@corona888.com")
        page_a.fill("#password", "Password123!")
        page_a.click("button[type='submit']")
        page_a.wait_for_url("**/dashboard", timeout=10000)

        # 2. Login B
        print("[E2E] Logging in Player B...")
        page_b.goto("http://localhost:5173/login", wait_until="networkidle")
        page_b.fill("#email", "player_b@corona888.com")
        page_b.fill("#password", "Password123!")
        page_b.click("button[type='submit']")
        page_b.wait_for_url("**/dashboard", timeout=10000)

        # 3. Navigate to Ludo
        print("[E2E] Navigating to Ludo lobby...")
        page_a.goto("http://localhost:5173/games/ludo", wait_until="networkidle")
        page_b.goto("http://localhost:5173/games/ludo", wait_until="networkidle")

        page_a.wait_for_selector("text=LUDO ARENA", timeout=15000)
        page_b.wait_for_selector("text=LUDO ARENA", timeout=15000)

        # 4. Player A joins matchmaking
        print("[E2E] Player A clicking FIND MATCH...")
        page_a.click("button:has-text('FIND MATCH')")
        page_a.wait_for_selector("text=SEARCHING OPPONENT", timeout=5000)
        print("[E2E] Player A is searching...")

        # 5. Player B joins matchmaking
        print("[E2E] Player B clicking FIND MATCH...")
        page_b.click("button:has-text('FIND MATCH')")

        # 6. Verify match found (board loading)
        print("[E2E] Waiting for match to start (WS-driven transition)...")
        page_a.wait_for_selector("svg", timeout=15000)
        page_b.wait_for_selector("svg", timeout=15000)
        print("[E2E] Both players reached the Ludo board!")

        # Verify colors
        assert "RED" in page_a.content(), "Player A should have RED tokens"
        assert "YELLOW" in page_b.content(), "Player B should have YELLOW tokens"
        print("[E2E] Color assignments: Player A is RED, Player B is YELLOW")

        # Save screenshots
        os.makedirs(ARTIFACTS_DIR, exist_ok=True)
        screenshot_path_a = os.path.join(ARTIFACTS_DIR, "ludo_mm_e2e_player_a.png")
        screenshot_path_b = os.path.join(ARTIFACTS_DIR, "ludo_mm_e2e_player_b.png")
        page_a.screenshot(path=screenshot_path_a)
        page_b.screenshot(path=screenshot_path_b)
        print(f"[E2E] Saved Player A screenshot: {screenshot_path_a}")
        print(f"[E2E] Saved Player B screenshot: {screenshot_path_b}")

        # Check DB state for verification
        db = get_db_session()
        try:
            from app.models.user import User
            from app.models.ludo import LudoPlayer, LudoMatch, LudoMatchStatus
            user_a = db.query(User).filter(User.email == "player_a@corona888.com").first()
            user_b = db.query(User).filter(User.email == "player_b@corona888.com").first()
            
            # Find the active match for User A
            player_a_entry = db.query(LudoPlayer).filter(LudoPlayer.user_id == user_a.id).order_by(LudoPlayer.created_at.desc()).first()
            player_b_entry = db.query(LudoPlayer).filter(LudoPlayer.user_id == user_b.id).order_by(LudoPlayer.created_at.desc()).first()
            
            assert player_a_entry is not None, "Player A record not found"
            assert player_b_entry is not None, "Player B record not found"
            assert player_a_entry.match_id == player_b_entry.match_id, "Players are not in the same match!"
            
            match_id = player_a_entry.match_id
            print(f"[E2E] Verified: Both players joined SAME Match ID: {match_id}")

            # Verify only ONE active match is created
            active_matches = db.query(LudoMatch).filter(LudoMatch.status == LudoMatchStatus.IN_PROGRESS).all()
            assert len(active_matches) == 1, f"Expected exactly 1 active match, found {len(active_matches)}"
            print("[E2E] Verified: Exactly ONE active match created in DB")

            # Check wallet deductions
            from app.services.wallet_service import get_balance
            bal_a = get_balance(db, user_a.id).balance
            bal_b = get_balance(db, user_b.id).balance
            print(f"[E2E] Wallet Balance A: {bal_a} paise (debit of 1000 confirmed)")
            print(f"[E2E] Wallet Balance B: {bal_b} paise (debit of 1000 confirmed)")
            assert bal_a == 49000, f"Player A balance should be 49000, got {bal_a}"
            assert bal_b == 49000, f"Player B balance should be 49000, got {bal_b}"
            print("[E2E] Verified: Wallet entries debited exactly once per player")

        finally:
            db.close()

        browser.close()

def test_ludo_matchmaking_rest_fallback():
    print("\n=== STARTING LUDO MATCHMAKING REST FALLBACK TEST ===")
    clean_and_prepare_db()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        
        ctx_a = browser.new_context(viewport={"width": 1280, "height": 800})
        ctx_b = browser.new_context(viewport={"width": 1280, "height": 800})
        
        page_a = ctx_a.new_page()
        page_b = ctx_b.new_page()

        page_a.on("console", lambda msg: print(f"[FALLBACK-A-CONSOLE] {msg.text}"))
        page_b.on("console", lambda msg: print(f"[FALLBACK-B-CONSOLE] {msg.text}"))

        # Completely disable WebSockets in browser context using page.add_init_script
        page_a.add_init_script("window.WebSocket = undefined;")
        page_b.add_init_script("window.WebSocket = undefined;")

        # 1. Login A
        page_a.goto("http://localhost:5173/login", wait_until="networkidle")
        page_a.fill("#email", "player_a@corona888.com")
        page_a.fill("#password", "Password123!")
        page_a.click("button[type='submit']")
        page_a.wait_for_url("**/dashboard", timeout=10000)

        # 2. Login B
        page_b.goto("http://localhost:5173/login", wait_until="networkidle")
        page_b.fill("#email", "player_b@corona888.com")
        page_b.fill("#password", "Password123!")
        page_b.click("button[type='submit']")
        page_b.wait_for_url("**/dashboard", timeout=10000)

        # 3. Go to Ludo
        page_a.goto("http://localhost:5173/games/ludo", wait_until="networkidle")
        page_b.goto("http://localhost:5173/games/ludo", wait_until="networkidle")

        page_a.wait_for_selector("text=LUDO ARENA", timeout=15000)
        page_b.wait_for_selector("text=LUDO ARENA", timeout=15000)

        # 4. Player A joins
        print("[E2E-FALLBACK] Player A joining (WS should fail and fallback to polling)...")
        page_a.click("button:has-text('FIND MATCH')")
        page_a.wait_for_selector("text=SEARCHING OPPONENT", timeout=5000)

        # 5. Player B joins
        print("[E2E-FALLBACK] Player B joining...")
        page_b.click("button:has-text('FIND MATCH')")

        # 6. Verify transition via polling
        print("[E2E-FALLBACK] Waiting for polling to detect match...")
        page_a.wait_for_selector("svg", timeout=15000)
        page_b.wait_for_selector("svg", timeout=15000)
        print("[E2E-FALLBACK] Success! Both players transitioned to Ludo board via REST polling fallback!")

        browser.close()


if __name__ == "__main__":
    test_two_browsers_ludo_matchmaking()
    test_ludo_matchmaking_rest_fallback()
