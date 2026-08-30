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

def test_all_viewports():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        for name, vp in VIEWPORTS:
            context = browser.new_context(viewport=vp)
            page = context.new_page()

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

            page.goto("http://localhost:5173/games/chicken-road", wait_until="networkidle")
            page.wait_for_timeout(3500)
            page.wait_for_selector(".cr-arcade-container", state="visible")
            page.wait_for_timeout(500)

            # Pre-bet shot
            pre_file = f"cr_pre_bet_{name}.png"
            page.screenshot(path=os.path.join(ARTIFACTS_DIR, pre_file))

            # Query DOM measurements
            def measure():
                return page.evaluate("""() => {
                    const selList = [
                        '.cr-header',
                        '.cr-header-title',
                        '.cr-header-help-btn',
                        '.cr-header-balance-pill',
                        '.cr-live-strip',
                        '.cr-game-stage',
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
                            x: Math.round(r.x * 100) / 100,
                            y: Math.round(r.y * 100) / 100,
                            w: Math.round(r.width * 100) / 100,
                            h: Math.round(r.height * 100) / 100,
                        };
                    });
                    return res;
                }""")

            m1 = measure()

            # Place bet
            page.click(".cr-play-btn")
            page.wait_for_timeout(600)

            # Active bet shot
            act_file = f"cr_active_{name}.png"
            page.screenshot(path=os.path.join(ARTIFACTS_DIR, act_file))

            m2 = measure()

            # Compare
            print(f"\n=================== VIEWPORT: {name} ===================")
            has_diff = False
            for k in m1:
                if m1[k] != m2[k]:
                    has_diff = True
                    print(f"DIFF in {k}:")
                    print(f"   Pre-bet: {m1[k]}")
                    print(f"   Active:  {m2[k]}")
            if not has_diff:
                print(f"Zero layout difference detected on {name}!")

            context.close()

        browser.close()

if __name__ == "__main__":
    test_all_viewports()
