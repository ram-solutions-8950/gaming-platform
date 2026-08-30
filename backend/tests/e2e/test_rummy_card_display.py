import os
import sys
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ARTIFACTS_DIR = r"C:\Users\bhask\.gemini\antigravity-ide\brain\ffa80695-5851-4f95-9c0e-75db0ece7540"

VIEWPORTS = [
    ("desktop_1280x800", {"width": 1280, "height": 800}),
    ("mobile_portrait_390x844", {"width": 390, "height": 844}),
    ("mobile_landscape_844x390", {"width": 844, "height": 390}),
    ("mobile_landscape_800x360", {"width": 800, "height": 360}),
]

def test_rummy_card():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        for name, vp in VIEWPORTS:
            context = browser.new_context(viewport=vp)
            page = context.new_page()
            
            # Login
            page.goto("http://localhost:5173/login", wait_until="networkidle")
            page.fill("#email", "player_a@corona888.com")
            page.fill("#password", "Password123!")
            page.click("button[type='submit']")
            page.wait_for_url("**/dashboard", timeout=10000)
            page.wait_for_selector(".lobby-carousel-container")
            page.wait_for_timeout(1000)

            # Close any popups
            try:
                page.click("button:has-text('✕')", timeout=1000)
            except Exception:
                pass

            # Find Indian Rummy card
            rummy_card = page.locator(".game-card--rummy").first
            assert rummy_card.is_visible(), f"Rummy card not visible on {name}"

            # Capture screenshot
            shot_file = f"dashboard_rummy_{name}.png"
            shot_path = os.path.join(ARTIFACTS_DIR, shot_file)
            page.screenshot(path=shot_path)
            print(f"[{name}] Screenshot saved: {shot_file}")

            # Test navigation on desktop
            if name == "desktop_1280x800":
                rummy_card.click()
                page.wait_for_url("**/games/rummy", timeout=5000)
                print("Successfully navigated to /games/rummy upon clicking Indian Rummy card!")
                rummy_page_shot = os.path.join(ARTIFACTS_DIR, "rummy_page_loaded.png")
                page.screenshot(path=rummy_page_shot)
                print("Captured rummy page screenshot:", rummy_page_shot)

            context.close()

        browser.close()
        print("ALL VERIFICATIONS COMPLETED SUCCESSFULLY!")

if __name__ == "__main__":
    test_rummy_card()
