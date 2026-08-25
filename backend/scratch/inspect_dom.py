import asyncio
from playwright.async_api import async_playwright
import os
import sys

sys.path.append(os.path.abspath(r"C:\Users\bhask\OneDrive\Desktop\clinets\gaming-platform\backend"))
from app.database import SessionLocal
from app.models.user import User, UserRole, UserStatus
from app.security.jwt import create_access_token

def get_token():
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.status == UserStatus.ACTIVE, User.role == UserRole.USER).first()
        return create_access_token(str(user.id), user.role.value)
    finally:
        db.close()

async def main():
    token = get_token()
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 844, "height": 390})
        await context.add_init_script(f"localStorage.setItem('access_token', '{token}');")
        page = await context.new_page()
        await page.goto("http://localhost:5173/games/chicken-road", wait_until="load")
        try:
            await page.wait_for_selector(".casino-loading-screen", state="detached", timeout=5000)
        except Exception:
            pass
        await page.wait_for_timeout(800)

        # Inspect all visible elements inside .cr-arcade-container
        elements = await page.evaluate("""() => {
            const list = [];
            document.querySelectorAll('.cr-arcade-container *').forEach(el => {
                const rect = el.getBoundingClientRect();
                const style = window.getComputedStyle(el);
                if (rect.width > 50 && rect.height > 50) {
                    list.push({
                        tag: el.tagName,
                        className: el.className,
                        width: rect.width,
                        height: rect.height,
                        top: rect.top,
                        left: rect.left,
                        bg: style.backgroundColor,
                        borderRadius: style.borderRadius
                    });
                }
            });
            return list;
        }""")
        for el in elements:
            print(el, flush=True)
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
