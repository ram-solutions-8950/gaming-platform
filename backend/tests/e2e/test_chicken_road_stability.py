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

def run_test():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        for name, vp in VIEWPORTS:
            print(f"\n=======================================================")
            print(f"TESTING VIEWPORT: {name}")
            print(f"=======================================================")
            context = browser.new_context(viewport=vp)
            page = context.new_page()

            page.goto("http://localhost:5173/login", wait_until="networkidle")
            page.fill("#email", "player_a@corona888.com")
            page.fill("#password", "Password123!")
            page.click("button[type='submit']")
            page.wait_for_url("**/dashboard", timeout=10000)

            # Close any promo popup
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

            # Pre-bet screenshot
            pre_path = os.path.join(ARTIFACTS_DIR, f"cr_pre_bet_{name}.png")
            page.screenshot(path=pre_path)
            print(f"Saved Pre-bet screenshot: {pre_path}")

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

            m_pre = measure()

            # Place bet / Start game
            btn = page.wait_for_selector(".cr-play-btn", state="visible")
            btn_text_before = btn.inner_text().strip()
            print(f"Pre-bet button text: {btn_text_before}")

            # If button is enabled and ready to play
            if "PLAY" in btn_text_before and "AGAIN" not in btn_text_before:
                btn.click()
                page.wait_for_timeout(600)
            elif "PLAY AGAIN" in btn_text_before:
                btn.click()
                page.wait_for_timeout(800)
                page.click(".cr-play-btn")
                page.wait_for_timeout(600)

            # Active bet screenshot
            act_path = os.path.join(ARTIFACTS_DIR, f"cr_active_{name}.png")
            page.screenshot(path=act_path)
            print(f"Saved Active screenshot: {act_path}")

            btn_active = page.query_selector(".cr-play-btn")
            btn_text_active = btn_active.inner_text().strip() if btn_active else ""
            print(f"Active button text: {btn_text_active}")

            m_act = measure()

            # Compare measurements
            diff_count = 0
            for sel in m_pre:
                p_box = m_pre.get(sel)
                a_box = m_act.get(sel)
                if p_box != a_box:
                    diff_count += 1
                    print(f"❌ SHIFT DETECTED in {sel}:")
                    print(f"   Pre-bet: {p_box}")
                    print(f"   Active:  {a_box}")
                else:
                    print(f"✅ STABLE {sel}: {p_box}")

            if diff_count == 0:
                print(f"🎉 SUCCESS on {name}: ZERO PIXEL DISPLACEMENT!")
            else:
                print(f"⚠️ {diff_count} element(s) shifted on {name}!")

            context.close()

        browser.close()

if __name__ == "__main__":
    run_test()
