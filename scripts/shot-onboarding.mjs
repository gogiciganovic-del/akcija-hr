/**
 * Screenshot onboarding: novi korisnik (3 koraka), favoriti (nema), ?trgovina=Konzum (nema).
 * Mobilni 390×844 i desktop 1280×800.
 * Pretpostavlja vite na 127.0.0.1:5173
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "../_tmp_search_shots");
fs.mkdirSync(outDir, { recursive: true });

const BASE = process.env.CJENKO_URL || "http://127.0.0.1:5173";
const DELAY = 3200;

async function freshPage(browser, viewport) {
  const page = await browser.newPage({
    viewport,
    deviceScaleFactor: viewport.width <= 400 ? 2 : 1,
  });
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  return page;
}

async function assertNoSheet(page, label) {
  await page.waitForTimeout(DELAY);
  const n = await page.locator('[data-testid="onboarding-sheet"]').count();
  if (n !== 0) throw new Error(`${label}: sheet must NOT show (count=${n})`);
}

async function assertSheet(page, label) {
  await page.waitForSelector('[data-testid="onboarding-sheet"]', {
    timeout: DELAY + 2000,
  });
  const n = await page.locator('[data-testid="onboarding-sheet"]').count();
  if (n !== 1) throw new Error(`${label}: expected sheet`);
}

const browser = await chromium.launch({ headless: true, channel: "chrome" });

for (const [tag, viewport] of [
  ["390", { width: 390, height: 844 }],
  ["desktop", { width: 1280, height: 800 }],
]) {
  // --- Novi korisnik: 3 koraka ---
  {
    const page = await freshPage(browser, viewport);
    await assertSheet(page, `new-${tag}`);
    await page.screenshot({
      path: path.join(outDir, `onboarding-new-step1-${tag}.png`),
      fullPage: false,
    });
    await page.locator('[data-testid="onboarding-next"]').click();
    await page.waitForTimeout(300);
    await page.screenshot({
      path: path.join(outDir, `onboarding-new-step2-${tag}.png`),
      fullPage: false,
    });
    await page.locator('[data-testid="onboarding-next"]').click();
    await page.waitForTimeout(300);
    await page.screenshot({
      path: path.join(outDir, `onboarding-new-step3-${tag}.png`),
      fullPage: false,
    });
    await page.close();
  }

  // --- Favoriti: ne smije se vidjeti ---
  {
    const page = await freshPage(browser, viewport);
    await page.evaluate(() => {
      localStorage.setItem(
        "akcije_favorites",
        JSON.stringify([["p1", { id: "p1", name: "Test" }]])
      );
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await assertNoSheet(page, `fav-${tag}`);
    await page.screenshot({
      path: path.join(outDir, `onboarding-hidden-favorites-${tag}.png`),
      fullPage: false,
    });
    await page.close();
  }

  // --- ?trgovina=Konzum ---
  {
    const page = await browser.newPage({
      viewport,
      deviceScaleFactor: viewport.width <= 400 ? 2 : 1,
    });
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.clear());
    await page.goto(BASE + "/?trgovina=Konzum", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await assertNoSheet(page, `trgovina-${tag}`);
    await page.screenshot({
      path: path.join(outDir, `onboarding-hidden-trgovina-${tag}.png`),
      fullPage: false,
    });
    await page.close();
  }
}

await browser.close();
console.log("OK shot-onboarding →", outDir);
