import os
import sys
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ARTIFACTS_DIR = r"C:\Users\bhask\.gemini\antigravity-ide\brain\ffa80695-5851-4f95-9c0e-75db0ece7540"

def test_chicken_road():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Test in mobile landscape 844x390
        page = browser.new_page(viewport={"width": 844, "height": 390})
        page.goto("http://localhost:5173/login", wait_until="networkidle")
        page.fill("#email", "player_a@corona888.com")
        page.fill("#password", "Password123!")
        page.click("button[type='submit']")
        page.wait_for_url("**/dashboard", timeout=10000)

        # Close popups
        page.wait_for_timeout(1000)
        try:
            page.click("button:has-text('✕')", timeout=1000)
        except Exception:
            pass

        # Navigate to Chicken Road
        page.goto("http://localhost:5173/games/chicken-road", wait_until="networkidle")
        page.wait_for_timeout(3500)
        page.wait_for_selector(".cr-arcade-container", state="visible")
        page.wait_for_timeout(1000)

        # PRE-BET state
        pre_bet_shot = os.path.join(ARTIFACTS_DIR, "chicken_road_pre_bet_844x390.png")
        page.screenshot(path=pre_bet_shot)
        print("Captured pre-bet screenshot:", pre_bet_shot)

        def get_layout_boxes():
            return page.evaluate("""() => {
                const getBox = (sel) => {
                    const el = document.querySelector(sel);
                    if (!el) return null;
                    const r = el.getBoundingClientRect();
                    const cs = window.getComputedStyle(el);
                    return {
                        x: Math.round(r.x * 10) / 10,
                        y: Math.round(r.y * 10) / 10,
                        w: Math.round(r.width * 10) / 10,
                        h: Math.round(r.height * 10) / 10,
                        display: cs.display,
                        visibility: cs.visibility,
                        padding: cs.padding,
                        margin: cs.margin
                    };
                };
                return {
                    header: getBox('.cr-header'),
                    liveStrip: getBox('.cr-live-strip'),
                    gameStage: getBox('.cr-game-stage'),
                    canvasViewport: getBox('.cr-canvas-viewport'),
                    hud: getBox('.cr-floating-hud'),
                    mobileControls: getBox('.cr-mobile-controls'),
                    bottomPanel: getBox('.cr-bottom-panel'),
                    stepper: getBox('.cr-bet-stepper-group'),
                    quickChips: getBox('.cr-quick-chips'),
                    diffPills: getBox('.cr-diff-pills'),
                    actionWrap: getBox('.cr-play-action-wrap'),
                    playBtn: getBox('.cr-play-btn'),
                };
            }""")

        pre_boxes = get_layout_boxes()
        print("PRE-BET BOXES:", pre_boxes)

        # Click PLAY button
        page.click(".cr-play-btn")
        page.wait_for_timeout(500)

        # ACTIVE state
        active_shot = os.path.join(ARTIFACTS_DIR, "chicken_road_active_844x390.png")
        page.screenshot(path=active_shot)
        print("Captured active crossing screenshot:", active_shot)

        active_boxes = get_layout_boxes()
        print("ACTIVE BOXES:", active_boxes)

        # Print differences
        diffs = []
        for k in pre_boxes:
            b1 = pre_boxes.get(k)
            b2 = active_boxes.get(k)
            if b1 != b2:
                diffs.append((k, b1, b2))

        print("\n--- DETECTED LAYOUT DIFFERENCES ---")
        if not diffs:
            print("No differences found in tracked boxes!")
        else:
            for k, b1, b2 in diffs:
                print(f"Key: {k}")
                print(f"  Pre-bet: {b1}")
                print(f"  Active:  {b2}")

        browser.close()

if __name__ == "__main__":
    test_chicken_road()
