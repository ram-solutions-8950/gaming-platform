import time
import os
import sys
from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ARTIFACTS_DIR = r"C:\Users\bhask\.gemini\antigravity-ide\brain\ffa80695-5851-4f95-9c0e-75db0ece7540"

VIEWPORTS = [
    {"width": 800, "height": 360, "name": "mobile_landscape_800x360", "landscape": True},
    {"width": 844, "height": 390, "name": "mobile_landscape_844x390", "landscape": True},
    {"width": 896, "height": 414, "name": "mobile_landscape_896x414", "landscape": True},
    {"width": 932, "height": 430, "name": "mobile_landscape_932x430", "landscape": True},
    {"width": 390, "height": 844, "name": "mobile_portrait_390x844", "landscape": False},
    {"width": 1920, "height": 1080, "name": "desktop_1920x1080", "landscape": False},
]

def verify_viewports():
    print("=== STARTING MULTI-VIEWPORT RESPONSIVE VERIFICATION ===")

    # Ensure queue is clean
    from app.database import SessionLocal
    from app.models.ludo import LudoMatchmakingQueue, LudoMatch, QueueStatus, LudoMatchStatus
    db = SessionLocal()
    db.query(LudoMatchmakingQueue).update({"status": QueueStatus.CANCELLED})
    db.query(LudoMatch).filter(LudoMatch.status == LudoMatchStatus.IN_PROGRESS).update({"status": LudoMatchStatus.CANCELLED})
    db.commit()
    db.close()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        for vp in VIEWPORTS:
            w, h, name, is_landscape = vp["width"], vp["height"], vp["name"], vp["landscape"]
            print(f"\n--- Testing Viewport {name} ({w}x{h}) [Landscape: {is_landscape}] ---")

            ctx = browser.new_context(viewport={"width": w, "height": h})
            page = ctx.new_page()

            # 1. Login
            page.goto("http://localhost:5173/login", wait_until="networkidle")
            page.fill("#email", "player_a@corona888.com")
            page.fill("#password", "Password123!")
            page.click("button[type='submit']")
            page.wait_for_url("**/dashboard", timeout=10000)

            # 2. Go to Ludo
            page.goto("http://localhost:5173/games/ludo", wait_until="networkidle")
            try:
                page.wait_for_selector(".casino-loading-screen", state="detached", timeout=10000)
            except Exception:
                pass
            try:
                page.wait_for_selector("text=LUDO ARENA", timeout=15000)
            except Exception as e:
                print(f"Failed to find LUDO ARENA. Current URL: {page.url}")
                page.screenshot(path=os.path.join(ARTIFACTS_DIR, f"error_ludo_{name}.png"))
                raise e
            time.sleep(0.5)

            # 3. Check scroll and viewport metrics
            metrics = page.evaluate("""() => {
                const container = document.querySelector('.ludo-page-container');
                const doc = document.documentElement;
                return {
                    docClientHeight: doc.clientHeight,
                    docScrollHeight: doc.scrollHeight,
                    containerClientWidth: container ? container.clientWidth : 0,
                    containerScrollWidth: container ? container.scrollWidth : 0,
                    containerClientHeight: container ? container.clientHeight : 0,
                    containerScrollHeight: container ? container.scrollHeight : 0,
                    scrollTop: container ? container.scrollTop : 0,
                    hasHorizontalScroll: (container ? container.scrollWidth : 0) > (container ? container.clientWidth : 0) + 2,
                    isZeroScroll: doc.scrollHeight <= doc.clientHeight + 2 && (container ? container.scrollHeight <= container.clientHeight + 2 : true)
                };
            }""")
            print(f" -> Metrics: {metrics}")
            assert not metrics["hasHorizontalScroll"], f"Horizontal overflow detected in {name}!"
            print(" -> [PASS] No horizontal overflow")

            if is_landscape:
                assert metrics["isZeroScroll"], f"Landscape viewport {name} requires vertical scrolling! (doc: {metrics['docScrollHeight']} > {metrics['docClientHeight']}, container: {metrics['containerScrollHeight']} > {metrics['containerClientHeight']})"
                print(f" -> [PASS] Perfect fit inside single landscape screen (Zero vertical scrolling required)")

            # 4. Verify all required elements are simultaneously visible
            header_txt = page.locator("text=LUDO ARENA")
            assert header_txt.is_visible(), f"LUDO ARENA header not visible in {name}"
            two_p_btn = page.locator("button:has-text('2 Players')")
            four_p_btn = page.locator("button:has-text('4 Players')")
            assert two_p_btn.is_visible(), f"2 Players button not visible in {name}"
            assert four_p_btn.is_visible(), f"4 Players button not visible in {name}"
            print(" -> [PASS] Top header, 2 Players and 4 Players cards visible")

            # Verify all 4 fee tiers are visible
            for fee in ['₹10', '₹50', '₹100', '₹500']:
                fee_btn = page.locator(f"button:has(span:text-is('{fee}'))")
                assert fee_btn.is_visible(), f"Fee tier {fee} not visible in {name}"
            print(" -> [PASS] All 4 fee tiers are visible on screen")

            # Check that all 4 fee tiers are on ONE row in landscape
            if is_landscape:
                row_check = page.evaluate("""() => {
                    const buttons = Array.from(document.querySelectorAll('.ludo-tier-btn'));
                    if (buttons.length < 4) return false;
                    const tops = buttons.map(b => Math.round(b.getBoundingClientRect().top));
                    return Math.max(...tops) - Math.min(...tops) <= 4;
                }""")
                assert row_check, f"Fee tiers are not on one row in landscape {name}!"
                print(" -> [PASS] All 4 fee tiers are aligned on ONE row")

            find_btn = page.locator("button:has-text('FIND MATCH')")
            assert find_btn.is_visible(), f"FIND MATCH button not visible in {name}"

            # Check clearance: FIND MATCH is completely above bottom navigation
            clearance_metrics = page.evaluate("""() => {
                const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('FIND MATCH'));
                const nav = document.querySelector('.lobby-bottom-nav');
                if (!btn) return { hasBtn: false };
                const btnRect = btn.getBoundingClientRect();
                const windowHeight = window.innerHeight;
                let isAboveNav = true;
                let navTop = windowHeight;
                if (nav && window.getComputedStyle(nav).display !== 'none') {
                    const navRect = nav.getBoundingClientRect();
                    if (navRect.height > 0) {
                        navTop = navRect.top;
                        isAboveNav = btnRect.bottom <= navRect.top + 2;
                    }
                } else {
                    isAboveNav = btnRect.bottom <= windowHeight;
                }
                return {
                    hasBtn: true,
                    btnTop: btnRect.top,
                    btnBottom: btnRect.bottom,
                    navTop: navTop,
                    isAboveNav: isAboveNav
                };
            }""")
            print(f" -> Clearance: {clearance_metrics}")
            assert clearance_metrics["isAboveNav"], f"FIND MATCH button is covered by bottom nav in {name}: {clearance_metrics}"
            print(" -> [PASS] FIND MATCH button is completely above bottom navigation (no overlap)")

            # Screenshot of the single-screen Lobby
            lobby_shot = os.path.join(ARTIFACTS_DIR, f"ludo_landscape_{name}.png")
            page.screenshot(path=lobby_shot)
            print(f" -> Saved screenshot: {lobby_shot}")

            # 5. Test interaction: switch to 4 Players and ₹50
            four_p_btn.click()
            time.sleep(0.2)
            page.locator("button:has(span:text-is('₹50'))").click()
            time.sleep(0.2)
            btn_text = find_btn.text_content()
            assert "₹50" in btn_text, f"Expected button to update to ₹50, got {btn_text}"
            print(f" -> [PASS] Interactive selection works: button updated to '{btn_text}'")

            # 6. Click FIND MATCH to open Matchmaking modal
            find_btn.click()
            page.wait_for_selector("text=SEARCHING OPPONENT", timeout=5000)
            time.sleep(0.5)

            # Verify modal fits inside viewport
            modal_metrics = page.evaluate("""() => {
                const modal = document.getElementById('ludo-matchmaking-card');
                if (!modal) return null;
                const rect = modal.getBoundingClientRect();
                return {
                    top: rect.top,
                    bottom: rect.bottom,
                    height: rect.height,
                    width: rect.width,
                    windowHeight: window.innerHeight,
                    fitsVertically: rect.top >= 0 && rect.bottom <= window.innerHeight + 4
                };
            }""")
            print(f" -> Modal Metrics: {modal_metrics}")
            assert modal_metrics is not None, f"Modal element not found in {name}"
            assert modal_metrics["fitsVertically"], f"Modal clipped vertically in {name}: {modal_metrics}"
            print(" -> [PASS] Matchmaking radar modal fits vertically inside viewport")

            # Click Cancel Matchmaking and verify lobby is restored
            cancel_btn = page.locator("button:has-text('Cancel Matchmaking')")
            assert cancel_btn.is_visible(), f"Cancel button not visible in {name}"
            cancel_btn.click()
            time.sleep(0.5)

            assert page.locator("text=LUDO ARENA").is_visible(), "Lobby not restored after cancel"
            print(" -> [PASS] Matchmaking triggered & canceled cleanly; lobby restored")

            ctx.close()

        browser.close()
        print("\n=== ALL 6 VIEWPORTS VERIFIED 100% SUCCESSFULLY! ===")

if __name__ == "__main__":
    verify_viewports()
