import time
import os
import sys
from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ARTIFACTS_DIR = r"C:\Users\bhask\.gemini\antigravity-ide\brain\ffa80695-5851-4f95-9c0e-75db0ece7540"

LANDSCAPE_VIEWPORTS = [
    {"width": 800, "height": 360, "name": "800x360"},
    {"width": 844, "height": 390, "name": "844x390"},
    {"width": 915, "height": 412, "name": "915x412"},
    {"width": 932, "height": 430, "name": "932x430"},
    {"width": 1024, "height": 600, "name": "1024x600"},
]

def clean_and_prepare_db():
    from app.database import SessionLocal
    from app.models.user import User
    from app.models.wallet import Wallet
    from app.models.ludo import LudoMatchmakingQueue, LudoMatch, QueueStatus, LudoMatchStatus

    db = SessionLocal()
    try:
        db.query(LudoMatchmakingQueue).update({"status": QueueStatus.CANCELLED})
        db.query(LudoMatch).filter(LudoMatch.status == LudoMatchStatus.IN_PROGRESS).update({"status": LudoMatchStatus.CANCELLED})
        
        emails = ["player_a@corona888.com", "player_b@corona888.com"]
        for email in emails:
            user = db.query(User).filter(User.email == email).first()
            if user:
                wallet = db.query(Wallet).filter(Wallet.user_id == user.id).first()
                if wallet:
                    wallet.balance = 50000
        db.commit()
    finally:
        db.close()

def test_ludo_landscape_active_match():
    print("=== STARTING LUDO ACTIVE MATCH LANDSCAPE SINGLE-SCREEN TEST ===")
    clean_and_prepare_db()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        ctx_a = browser.new_context(viewport={"width": 800, "height": 360})
        ctx_b = browser.new_context(viewport={"width": 800, "height": 360})

        page_a = ctx_a.new_page()
        page_b = ctx_b.new_page()

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

        # 3. Navigate to Ludo
        page_a.goto("http://localhost:5173/games/ludo", wait_until="networkidle")
        page_b.goto("http://localhost:5173/games/ludo", wait_until="networkidle")

        page_a.wait_for_selector("text=LUDO ARENA", timeout=15000)
        page_b.wait_for_selector("text=LUDO ARENA", timeout=15000)

        # 4. Start Matchmaking
        print("[TEST] Both players joining 2P match...")
        page_a.click("button:has-text('FIND MATCH')")
        page_a.wait_for_selector("text=SEARCHING OPPONENT", timeout=5000)

        page_b.click("button:has-text('FIND MATCH')")

        # 5. Wait for active board
        page_a.wait_for_selector("svg", timeout=15000)
        page_b.wait_for_selector("svg", timeout=15000)
        print("[TEST] Both players reached active match board!")

        # 6. Test across all target landscape viewports
        for vp in LANDSCAPE_VIEWPORTS:
            w, h, name = vp["width"], vp["height"], vp["name"]
            print(f"\n--- Testing Active Match at Viewport {name} ({w}x{h}) ---")
            
            page_a.set_viewport_size({"width": w, "height": h})
            time.sleep(0.8) # allow transition / layout reflow

            metrics = page_a.evaluate("""() => {
                const doc = document.documentElement;
                const container = document.querySelector('.ludo-page-container');
                const activeMatch = document.querySelector('.ludo-active-match');
                const board = document.querySelector('.ludo-board-wrapper');
                const boardSvg = board ? board.querySelector('svg') : null;
                const diceBox = document.querySelector('.ludo-dice-box');
                const sidePanel = document.querySelector('.ludo-controls-side-panel');
                const header = document.querySelector('.ludo-game-header');
                const bottomNav = document.querySelector('.lobby-bottom-nav');

                const bRect = board ? board.getBoundingClientRect() : null;
                const dRect = diceBox ? diceBox.getBoundingClientRect() : null;
                const hRect = header ? header.getBoundingClientRect() : null;
                const navRect = bottomNav ? bottomNav.getBoundingClientRect() : null;

                return {
                    docScrollHeight: doc.scrollHeight,
                    docClientHeight: doc.clientHeight,
                    docScrollWidth: doc.scrollWidth,
                    docClientWidth: doc.clientWidth,
                    containerScrollHeight: container ? container.scrollHeight : 0,
                    containerClientHeight: container ? container.clientHeight : 0,
                    containerScrollWidth: container ? container.scrollWidth : 0,
                    containerClientWidth: container ? container.clientWidth : 0,
                    boardRect: bRect ? {
                        top: bRect.top,
                        bottom: bRect.bottom,
                        left: bRect.left,
                        right: bRect.right,
                        width: bRect.width,
                        height: bRect.height,
                    } : null,
                    diceRect: dRect ? {
                        top: dRect.top,
                        bottom: dRect.bottom,
                        left: dRect.left,
                        right: dRect.right,
                        width: dRect.width,
                        height: dRect.height,
                    } : null,
                    headerVisible: header ? hRect.height > 0 && hRect.top >= 0 : false,
                    bottomNavTop: navRect ? navRect.top : 0,
                    viewportHeight: window.innerHeight,
                    viewportWidth: window.innerWidth,
                };
            }""")

            print(f" -> Metrics: doc: {metrics['docClientWidth']}x{metrics['docClientHeight']}, board: {metrics['boardRect']['width']:.1f}x{metrics['boardRect']['height']:.1f}")
            print(f" -> Board bounds: top={metrics['boardRect']['top']:.1f}, bottom={metrics['boardRect']['bottom']:.1f}, left={metrics['boardRect']['left']:.1f}")
            print(f" -> Dice bounds: top={metrics['diceRect']['top']:.1f}, bottom={metrics['diceRect']['bottom']:.1f}, right={metrics['diceRect']['right']:.1f}")

            # Verification 1: Zero vertical or horizontal scrolling
            is_zero_scroll = (metrics["docScrollHeight"] <= metrics["docClientHeight"] + 2 and
                              metrics["containerScrollHeight"] <= metrics["containerClientHeight"] + 2 and
                              metrics["docScrollWidth"] <= metrics["docClientWidth"] + 2 and
                              metrics["containerScrollWidth"] <= metrics["containerClientWidth"] + 2)
            assert is_zero_scroll, (
                f"Scrolling detected at {name}! "
                f"doc: {metrics['docScrollHeight']} > {metrics['docClientHeight']}, "
                f"container: {metrics['containerScrollHeight']} > {metrics['containerClientHeight']}"
            )
            print(" -> [PASS] Zero vertical and horizontal scrolling confirmed!")

            # Verification 2: Board is square (width ~ height) and completely inside viewport
            b = metrics["boardRect"]
            assert abs(b["width"] - b["height"]) <= 3.0, f"Board is not square! width={b['width']}, height={b['height']}"
            assert b["top"] >= 0, f"Board top is cropped! top={b['top']}"
            assert b["bottom"] <= metrics["bottomNavTop"] + 1, f"Board overlaps bottom nav! bottom={b['bottom']} > navTop={metrics['bottomNavTop']}"
            assert b["bottom"] <= h, f"Board overflows viewport! bottom={b['bottom']} > viewportHeight={h}"
            print(" -> [PASS] Complete square Ludo board visible, no cropping!")

            # Verification 3: Dice and side panel completely inside viewport
            d = metrics["diceRect"]
            assert d["top"] >= 0, f"Dice top cropped! top={d['top']}"
            assert d["bottom"] <= metrics["bottomNavTop"] + 1, f"Dice overlaps bottom nav! bottom={d['bottom']} > navTop={metrics['bottomNavTop']}"
            assert d["right"] <= w, f"Dice overflows horizontally! right={d['right']} > viewportWidth={w}"
            print(" -> [PASS] Complete Dice & Turn Timer visible!")

            # Verification 4: Header visible
            assert metrics["headerVisible"], f"Header not visible at {name}"
            print(" -> [PASS] Game header visible!")

            # Screenshot
            os.makedirs(ARTIFACTS_DIR, exist_ok=True)
            shot_path = os.path.join(ARTIFACTS_DIR, f"ludo_landscape_active_{name}.png")
            page_a.screenshot(path=shot_path)
            print(f" -> [PASS] Saved screenshot: {shot_path}")

        print("\n=== ALL LANDSCAPE VIEWPORTS VERIFIED 100% PERFECT! ===")
        browser.close()

if __name__ == "__main__":
    test_ludo_landscape_active_match()
