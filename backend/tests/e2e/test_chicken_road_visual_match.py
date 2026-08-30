import os
import sys
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ARTIFACTS_DIR = r"C:\Users\bhask\.gemini\antigravity-ide\brain\ffa80695-5851-4f95-9c0e-75db0ece7540"

def test_visual_match():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Test in exact landscape viewport 844x390 (iPhone 14 Pro landscape, matching user screenshot)
        context = browser.new_context(viewport={"width": 844, "height": 390})
        page = context.new_page()

        page.goto("http://localhost:5173/login", wait_until="networkidle")
        page.fill("#email", "player_a@corona888.com")
        page.fill("#password", "Password123!")
        page.click("button[type='submit']")
        page.wait_for_url("**/dashboard", timeout=10000)

        # Close any popup
        page.wait_for_timeout(1000)
        try:
            page.click("button:has-text('✕')", timeout=1000)
        except Exception:
            pass

        # Reset any active round cleanly before measuring
        page.evaluate("""async () => {
            const token = localStorage.getItem('token');
            if (!token) return;
            try {
                const res = await fetch('/api/v1/games/chicken-road/state', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const json = await res.json();
                if (json.data && json.data.round_id && json.data.status === 'ACTIVE') {
                    await fetch('/api/v1/games/chicken-road/collision', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ round_id: json.data.round_id, lane_index: 1 })
                    });
                }
            } catch(e) {}
        }""")

        # Navigate to Chicken Road
        page.goto("http://localhost:5173/games/chicken-road", wait_until="networkidle")
        page.wait_for_timeout(3500)
        page.wait_for_selector(".cr-arcade-container", state="visible")
        page.wait_for_timeout(500)

        # If in win/loss modal, click PLAY AGAIN
        try:
            play_again = page.query_selector(".cr-modal-action-btn, button:has-text('PLAY AGAIN')")
            if play_again and play_again.is_visible():
                play_again.click()
                page.wait_for_timeout(600)
        except Exception:
            pass

        def measure():
            return page.evaluate("""() => {
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

        # 1. SCREENSHOT READY
        ready_shot = os.path.join(ARTIFACTS_DIR, "chicken_road_ready_screenshot.png")
        page.screenshot(path=ready_shot)
        print("Captured READY screenshot:", ready_shot)
        boxes_ready = measure()

        # 2. CLICK PLAY ₹10
        btn = page.wait_for_selector(".cr-play-btn", state="visible")
        btn_text = btn.inner_text().strip()
        print(f"Clicking action button: '{btn_text}'")
        btn.click()
        page.wait_for_timeout(600)

        # 3. SCREENSHOT ACTIVE
        active_shot = os.path.join(ARTIFACTS_DIR, "chicken_road_active_screenshot.png")
        page.screenshot(path=active_shot)
        print("Captured ACTIVE screenshot:", active_shot)
        boxes_active = measure()

        # 4. MEASUREMENT COMPARISON
        print("\n=======================================================")
        print("BOUNDING BOX COMPARISON: READY vs ACTIVE")
        print("=======================================================")
        shifts = []
        for sel in boxes_ready:
            b1 = boxes_ready[sel]
            b2 = boxes_active[sel]
            if b1 != b2:
                shifts.append((sel, b1, b2))
                print(f"❌ SHIFT in {sel}:")
                print(f"   READY:  {b1}")
                print(f"   ACTIVE: {b2}")
            else:
                print(f"✅ STABLE {sel}: {b1}")

        if not shifts:
            print("\n🎉 PERFECT MATCH! ZERO PIXEL DISPLACEMENT DETECTED ACROSS ALL COMPONENTS!")
        else:
            print(f"\n⚠️ {len(shifts)} element(s) had layout shifts!")

        context.close()
        browser.close()

if __name__ == "__main__":
    test_visual_match()
