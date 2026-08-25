import asyncio
import os
import sys
from playwright.async_api import async_playwright

sys.path.append(os.path.abspath(r"C:\Users\bhask\OneDrive\Desktop\clinets\gaming-platform\backend"))
from app.database import SessionLocal
from app.models.user import User, UserRole, UserStatus
from app.security.jwt import create_access_token

def get_access_token():
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.status == UserStatus.ACTIVE, User.role == UserRole.USER).first()
        if not user:
            raise RuntimeError("No active test user found.")
        return create_access_token(str(user.id), user.role.value)
    finally:
        db.close()

VIEWPORTS = [
    {"name": "844x390", "width": 844, "height": 390},
    {"name": "896x414", "width": 896, "height": 414},
    {"name": "932x430", "width": 932, "height": 430},
    {"name": "1024x600", "width": 1024, "height": 600},
]

async def main():
    access_token = get_access_token()
    out_dir = r"C:\Users\bhask\.gemini\antigravity-ide\brain\bc51be8e-2867-4e9a-8bbd-7929268a5cab\scratch\screenshots"
    os.makedirs(out_dir, exist_ok=True)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        
        # 1. Capture Ready state at all 4 landscape resolutions
        for vp in VIEWPORTS:
            context = await browser.new_context(
                viewport={"width": vp["width"], "height": vp["height"]},
                device_scale_factor=2,
            )
            await context.add_init_script(f"""
                localStorage.setItem('access_token', '{access_token}');
            """)
            page = await context.new_page()
            await page.goto("http://localhost:5173/games/chicken-road", wait_until="load")
            
            try:
                await page.wait_for_selector(".casino-loading-screen", state="detached", timeout=5000)
            except Exception:
                pass
            await page.wait_for_timeout(1000)
            
            shot_path = os.path.join(out_dir, f"chicken_road_{vp['name']}.png")
            await page.screenshot(path=shot_path, full_page=False)
            print(f"Captured: {shot_path}", flush=True)
            await context.close()

        # 2. Capture How To Play Modal
        context = await browser.new_context(
            viewport={"width": 844, "height": 390},
            device_scale_factor=2,
        )
        await context.add_init_script(f"""
            localStorage.setItem('access_token', '{access_token}');
        """)
        page = await context.new_page()
        await page.goto("http://localhost:5173/games/chicken-road", wait_until="load")
        try:
            await page.wait_for_selector(".casino-loading-screen", state="detached", timeout=5000)
        except Exception:
            pass
        await page.wait_for_timeout(800)
        
        # Click How to Play
        await page.click("button.cr-header-help-btn")
        await page.wait_for_timeout(400)
        shot_help = os.path.join(out_dir, "chicken_road_how_to_play.png")
        await page.screenshot(path=shot_help)
        print(f"Captured: {shot_help}", flush=True)
        
        # Close Help Modal
        await page.click("button:has-text('GOT IT')")
        await page.wait_for_timeout(300)
        
        # 3. Start Game (Active Gameplay)
        await page.click("button.cr-play-btn")
        await page.wait_for_timeout(400)
        shot_active = os.path.join(out_dir, "chicken_road_active_gameplay.png")
        await page.screenshot(path=shot_active)
        print(f"Captured: {shot_active}", flush=True)
        
        # 4. Immediate Cashout for Win Modal
        try:
            await page.click("button.cr-cashout-btn", timeout=2000)
            await page.wait_for_timeout(800)
            shot_win = os.path.join(out_dir, "chicken_road_win_modal.png")
            await page.screenshot(path=shot_win)
            print(f"Captured: {shot_win}", flush=True)
        except Exception as e:
            print(f"Cashout note: {e}", flush=True)

        await context.close()
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
