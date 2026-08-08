"""Capture 5 Google Play screenshots (1080x1920) from the live app."""
from __future__ import annotations

import asyncio
import os
import re
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "android-twa"
W, H = 1080, 1920
BASE_URL = os.environ.get("SCREENSHOT_URL", "https://cjenko.app")
CART_ITEMS = ("mlijeko", "kruh", "maslac", "jaja")


async def widen_app(page) -> None:
    await page.evaluate(
        """() => {
      document.querySelectorAll('.max-w-sm').forEach((el) => {
        el.style.maxWidth = '100%';
        el.style.width = '100%';
        el.style.marginLeft = '0';
        el.style.marginRight = '0';
      });
    }"""
    )


async def wait_products(page, timeout: float = 45_000) -> None:
    await page.wait_for_selector("div.grid.grid-cols-2", timeout=timeout)
    await page.wait_for_timeout(1500)


async def go_home(page) -> None:
    await page.get_by_role("button", name="Početna").click()
    await page.wait_for_timeout(800)
    await widen_app(page)


async def capture(page, name: str) -> Path:
    path = OUT_DIR / name
    await page.screenshot(path=str(path), type="png")
    print(f"Wrote {path}")
    return path


async def add_cart_items(page) -> None:
    await page.get_by_role("button", name="Košarica").click()
    await page.wait_for_timeout(800)
    await widen_app(page)
    input_el = page.get_by_placeholder(re.compile("Nutella|mlijeko", re.I))
    for item in CART_ITEMS:
        await input_el.fill(item)
        await page.wait_for_timeout(500)
        suggestion = page.locator("ul li button").first
        if await suggestion.count() > 0 and await suggestion.is_visible():
            await suggestion.click()
        else:
            await input_el.press("Enter")
        await page.wait_for_timeout(400)
    # Ensure at least 2 items on list
    list_items = page.locator("ul.px-4.mb-4 li")
    if await list_items.count() < 2:
        for item in ("ulje", "šećer"):
            await input_el.fill(item)
            await page.wait_for_timeout(400)
            await input_el.press("Enter")
            await page.wait_for_timeout(400)
    compare = page.get_by_text("Pronađi najjeftinije", exact=True)
    await compare.wait_for(state="visible", timeout=15_000)
    await compare.click()
    await page.get_by_text("NAJBOLJA PONUDA").wait_for(timeout=90_000)
    await page.wait_for_timeout(1200)


async def seed_favorites_from_home(page) -> None:
    await go_home(page)
    await wait_products(page)
    cards = page.locator("div.grid.grid-cols-2 > div")
    count = min(await cards.count(), 8)
    clicked = 0
    for i in range(count):
        heart = cards.nth(i).locator("button").first
        if await heart.is_visible():
            await heart.click()
            clicked += 1
            await page.wait_for_timeout(300)
        if clicked >= 4:
            break
    await page.wait_for_timeout(500)


async def run(base_url: str) -> None:
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        raise SystemExit("Install: py -m pip install playwright && py -m playwright install chromium")

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context(
            viewport={"width": W, "height": H},
            device_scale_factor=1,
            locale="hr-HR",
        )
        page = await context.new_page()

        print(f"Loading {base_url} …")
        await page.goto(base_url, wait_until="domcontentloaded", timeout=90_000)
        await page.wait_for_load_state("networkidle", timeout=90_000)
        await page.wait_for_timeout(2500)
        await widen_app(page)
        await wait_products(page)

        # 1 — home with stores
        await capture(page, "screenshot-1.png")

        # 2 — Novo filter
        await page.get_by_role("button", name=re.compile(r"Novo")).click()
        await page.locator("h2", has_text=re.compile(r"Novo")).wait_for(timeout=15_000)
        await page.wait_for_timeout(1200)
        await capture(page, "screenshot-2.png")

        # 3 — Danas ističe
        await page.get_by_role("button", name=re.compile(r"Danas ističe")).click()
        await page.locator("h2", has_text=re.compile(r"Danas ističe")).wait_for(timeout=15_000)
        await page.wait_for_timeout(1200)
        await capture(page, "screenshot-3.png")

        # 4 — cart comparison
        await add_cart_items(page)
        await capture(page, "screenshot-4.png")

        # 5 — favorites
        await seed_favorites_from_home(page)
        await page.get_by_role("button", name="Favoriti").click()
        await page.locator("h1", has_text="Favoriti").wait_for(timeout=10_000)
        await page.wait_for_timeout(1200)
        await widen_app(page)
        await capture(page, "screenshot-5.png")

        await browser.close()


def maybe_start_dev_server() -> subprocess.Popen | None:
    if os.environ.get("SCREENSHOT_URL"):
        return None
    try:
        import urllib.request

        urllib.request.urlopen(BASE_URL, timeout=8)
        return None
    except Exception:
        pass
    print("Starting local dev server on http://127.0.0.1:5173 …")
    proc = subprocess.Popen(
        ["npm", "run", "dev", "--", "--host", "127.0.0.1", "--port", "5173"],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        shell=True,
    )
    for _ in range(40):
        time.sleep(0.5)
        try:
            import urllib.request

            urllib.request.urlopen("http://127.0.0.1:5173/", timeout=2)
            os.environ["SCREENSHOT_URL"] = "http://127.0.0.1:5173"
            return proc
        except Exception:
            continue
    proc.kill()
    return None


def main() -> None:
    dev = maybe_start_dev_server()
    url = os.environ.get("SCREENSHOT_URL", BASE_URL)
    try:
        asyncio.run(run(url))
    finally:
        if dev:
            dev.terminate()


if __name__ == "__main__":
    main()
