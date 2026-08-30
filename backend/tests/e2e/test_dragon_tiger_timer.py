import time
import os
import sys
from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ARTIFACTS_DIR = r"C:\Users\bhask\.gemini\antigravity-ide\brain\ffa80695-5851-4f95-9c0e-75db0ece7540"

def test_dragon_tiger_ui_timer():
    print("=== TESTING DRAGON TIGER 15-SECOND UI COUNTDOWN ===")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 844, "height": 390})
        page = context.new_page()

        # Login
        page.goto("http://localhost:5173/login", wait_until="networkidle")
        page.fill("#email", "player_a@corona888.com")
        page.fill("#password", "Password123!")
        page.click("button[type='submit']")
        page.wait_for_url("**/dashboard", timeout=10000)

        # Navigate to Dragon Tiger
        page.goto("http://localhost:5173/games/dragon-tiger", wait_until="networkidle")
        page.wait_for_selector(".dragon-tiger-game", timeout=15000)
        print("[TEST] Dragon Tiger page loaded successfully.")

        # Wait for BET TIME to be visible (or monitor across cycle)
        bet_time_observed = False
        for i in range(30):
            metrics = page.evaluate("""() => {
                const countBox = document.querySelector('.dragon-tiger-game .border-2 span');
                const label = document.querySelector('.dragon-tiger-game span.uppercase');
                const dragonBtn = document.querySelector('button[data-zone="DRAGON"]');
                const buttons = Array.from(document.querySelectorAll('button'));
                const placeBtn = buttons.find(b => b.innerText.includes('BET') || b.innerText.includes('REBET'));
                
                return {
                    countdownText: countBox ? countBox.innerText : null,
                    labelText: label ? label.innerText : null,
                    dragonDisabled: dragonBtn ? dragonBtn.disabled : null,
                    placeBtnDisabled: placeBtn ? placeBtn.disabled : null,
                };
            }""")
            print(f"[TEST] Second {i+1}: Countdown = {metrics['countdownText']}, Label = {metrics['labelText']}, Dragon Disabled = {metrics['dragonDisabled']}")
            
            if metrics['labelText'] == 'BET TIME':
                bet_time_observed = True
                val = int(metrics['countdownText'])
                assert val <= 15, f"Expected countdown <= 15, got {val}"
                assert metrics['dragonDisabled'] is False, "Dragon betting button should be enabled during BET TIME"
                print(f" -> [PASS] Verified active BET TIME at countdown {val}s <= 15s with buttons enabled!")
                break
            time.sleep(1.0)

        assert bet_time_observed, "Did not observe BET TIME within 30 seconds"

        # Ensure screenshot
        os.makedirs(ARTIFACTS_DIR, exist_ok=True)
        shot_path = os.path.join(ARTIFACTS_DIR, "dragon_tiger_15s_timer.png")
        page.screenshot(path=shot_path)
        print(f"[TEST] Saved screenshot to {shot_path}")

        browser.close()
        print("=== DRAGON TIGER UI COUNTDOWN VERIFIED 100%! ===")

if __name__ == "__main__":
    test_dragon_tiger_ui_timer()
