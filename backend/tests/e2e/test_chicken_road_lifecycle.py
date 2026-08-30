import os
import sys
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ARTIFACTS_DIR = r"C:\Users\bhask\.gemini\antigravity-ide\brain\ffa80695-5851-4f95-9c0e-75db0ece7540"

VIEWPORTS = [
    ("800x360", {"width": 800, "height": 360}),
    ("844x390", {"width": 844, "height": 390}),
    ("896x414", {"width": 896, "height": 414}),
    ("1280x800", {"width": 1280, "height": 800}),
    ("390x844", {"width": 390, "height": 844}),
]

def test_full_lifecycle():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        for name, vp in VIEWPORTS:
            print(f"\n=======================================================")
            print(f"TESTING FULL LIFECYCLE ON: {name}")
            print(f"=======================================================")
            context = browser.new_context(viewport=vp)
            page = context.new_page()

            page.goto("http://localhost:5173/login", wait_until="networkidle")
            page.fill("#email", "player_a@corona888.com")
            page.fill("#password", "Password123!")
            page.click("button[type='submit']")
            page.wait_for_url("**/dashboard", timeout=10000)

            # Close popup if present
            page.wait_for_timeout(1000)
            try:
                page.click("button:has-text('✕')", timeout=1000)
            except Exception:
                pass

            page.goto("http://localhost:5173/games/chicken-road", wait_until="networkidle")
            page.wait_for_timeout(3500)
            page.wait_for_selector(".cr-arcade-container", state="visible")
            page.wait_for_timeout(600)

            # Helper to measure all tracked elements
            def measure(stage_name):
                boxes = page.evaluate("""() => {
                    const selList = [
                        '.cr-header',
                        '.cr-header-title',
                        '.cr-header-help-btn',
                        '.cr-header-balance-pill',
                        '.cr-live-strip',
                        '.cr-game-stage',
                        '.cr-canvas-viewport',
                        '.cr-floating-hud',
                        '.cr-bottom-panel',
                        '.cr-bet-stepper-group',
                        '.cr-stepper-input-box',
                        '.cr-quick-chips',
                        '.cr-diff-pills',
                        '.cr-play-action-wrap',
                        '.cr-play-btn',
                        '.cr-mobile-controls'
                    ];
                    const res = {};
                    selList.forEach(s => {
                        const el = document.querySelector(s);
                        if (!el) {
                            res[s] = null;
                            return;
                        }
                        const r = el.getBoundingClientRect();
                        res[s] = {
                            x: Math.round(r.x * 10) / 10,
                            y: Math.round(r.y * 10) / 10,
                            w: Math.round(r.width * 10) / 10,
                            h: Math.round(r.height * 10) / 10,
                        };
                    });
                    return res;
                }""")
                return boxes

            # If already in ACTIVE state, report collision to finish round
            page.evaluate("""async () => {
                const token = localStorage.getItem('token') || '';
                try {
                    await fetch('/api/v1/chicken-road/collision', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ lane: 1 })
                    });
                } catch(e) {}
            }""")
            page.wait_for_timeout(500)
            page.reload(wait_until="networkidle")
            page.wait_for_timeout(2500)

            # If in win/loss, reset it
            try:
                play_again = page.query_selector("button:has-text('PLAY AGAIN')")
                if play_again and play_again.is_visible():
                    play_again.click()
                    page.wait_for_timeout(800)
            except Exception:
                pass

            # 1. READY STATE
            ready_boxes = measure("READY")
            page.screenshot(path=os.path.join(ARTIFACTS_DIR, f"lifecycle_ready_{name}.png"))

            # 2. START / ACTIVE
            page.click(".cr-play-btn")
            page.wait_for_timeout(600)
            active_boxes = measure("ACTIVE")
            page.screenshot(path=os.path.join(ARTIFACTS_DIR, f"lifecycle_active_{name}.png"))

            # Compare READY vs ACTIVE
            diffs_ready_active = []
            for k in ready_boxes:
                if ready_boxes[k] != active_boxes[k]:
                    diffs_ready_active.append((k, ready_boxes[k], active_boxes[k]))

            if diffs_ready_active:
                print(f"❌ Layout diffs between READY and ACTIVE on {name}:")
                for k, b1, b2 in diffs_ready_active:
                    print(f"   {k}: {b1} -> {b2}")
            else:
                print(f"✅ READY -> ACTIVE: 0px displacement on {name}")

            # 3. Simulate Collision / Game Over to check LOST state
            # Steer right into traffic
            for _ in range(5):
                page.keyboard.press("ArrowRight")
                page.wait_for_timeout(300)

            # Wait for either crash or modal
            page.wait_for_timeout(2000)
            lost_boxes = measure("RESULT")
            page.screenshot(path=os.path.join(ARTIFACTS_DIR, f"lifecycle_result_{name}.png"))

            # Compare underlying elements during RESULT state vs READY state
            diffs_result = []
            for k in ready_boxes:
                # Modal is on top, but underlying elements must remain at exact same spots
                if ready_boxes[k] != lost_boxes[k]:
                    diffs_result.append((k, ready_boxes[k], lost_boxes[k]))

            if diffs_result:
                print(f"❌ Layout diffs between READY and RESULT on {name}:")
                for k, b1, b2 in diffs_result:
                    print(f"   {k}: {b1} -> {b2}")
            else:
                print(f"✅ RESULT / MODAL: 0px displacement on underlying UI on {name}")

            # 4. Click PLAY AGAIN to return to READY
            try:
                # Try clicking play again on modal or bottom bar
                pa_btn = page.query_selector(".cr-modal-action-btn, button:has-text('PLAY AGAIN')")
                if pa_btn:
                    pa_btn.click()
                    page.wait_for_timeout(800)
                    cycle_boxes = measure("CYCLE_READY")
                    page.screenshot(path=os.path.join(ARTIFACTS_DIR, f"lifecycle_cycle_ready_{name}.png"))
                    diffs_cycle = []
                    for k in ready_boxes:
                        if ready_boxes[k] != cycle_boxes[k]:
                            diffs_cycle.append((k, ready_boxes[k], cycle_boxes[k]))
                    if diffs_cycle:
                        print(f"❌ Layout diffs after PLAY AGAIN on {name}:")
                        for k, b1, b2 in diffs_cycle:
                            print(f"   {k}: {b1} -> {b2}")
                    else:
                        print(f"✅ FULL CYCLE (READY -> ACTIVE -> RESULT -> PLAY AGAIN): 0px displacement on {name}")
            except Exception as e:
                print(f"Error cycling: {e}")

            context.close()

        browser.close()

if __name__ == "__main__":
    test_full_lifecycle()
