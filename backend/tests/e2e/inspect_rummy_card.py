import os
import sys
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ARTIFACTS_DIR = r"C:\Users\bhask\.gemini\antigravity-ide\brain\ffa80695-5851-4f95-9c0e-75db0ece7540"

def inspect_rummy():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        page.goto("http://localhost:5173/login", wait_until="networkidle")
        page.fill("#email", "player_a@corona888.com")
        page.fill("#password", "Password123!")
        page.click("button[type='submit']")
        page.wait_for_url("**/dashboard", timeout=10000)
        page.wait_for_selector(".lobby-carousel-container")

        # Close any popups if present
        page.wait_for_timeout(1000)
        try:
            page.click("button:has-text('✕')", timeout=1000)
        except Exception:
            pass

        shot_path = os.path.join(ARTIFACTS_DIR, "dashboard_current_desktop.png")
        page.screenshot(path=shot_path)
        print("Captured dashboard screenshot:", shot_path)

        res = page.evaluate("""() => {
            const card = document.querySelector('.game-card--casino-card');
            if (!card) return 'Not found';
            const img = card.querySelector('.casino-card-art-img');
            const wrap = card.querySelector('.casino-card-art-img-wrap');
            const container = card.querySelector('.casino-card-art-container');
            
            const getStyles = (el) => {
                const cs = window.getComputedStyle(el);
                const r = el.getBoundingClientRect();
                return {
                    rect: { x: r.x, y: r.y, w: r.width, h: r.height },
                    width: cs.width,
                    height: cs.height,
                    top: cs.top,
                    left: cs.left,
                    transform: cs.transform,
                    objectFit: cs.objectFit,
                    objectPosition: cs.objectPosition,
                    position: cs.position,
                    zIndex: cs.zIndex,
                    overflow: cs.overflow
                };
            };
            
            return {
                card: getStyles(card),
                container: container ? getStyles(container) : null,
                wrap: wrap ? getStyles(wrap) : null,
                img: img ? getStyles(img) : null,
                imgSrc: img ? img.src : null,
                naturalSize: img ? { w: img.naturalWidth, h: img.naturalHeight } : null
            };
        }""")
        import pprint
        pprint.pprint(res)
        browser.close()

if __name__ == "__main__":
    inspect_rummy()
