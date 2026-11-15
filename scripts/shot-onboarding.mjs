/**
 * Screenshot onboarding (jedan ekran) na 390×844:
 * - početno stanje
 * - Kaufland odabran → prekidač vidljiv
 * - samo Konzum → bez prekidača
 * Plus gate: favoriti / ?trgovina= (nema sheeta).
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
  // Bez notrack — gate blokira onboarding kad je ?notrack= u URL-u.
  await page.goto(BASE + "/?shot=1", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
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
const viewport = { width: 390, height: 844 };

{
  const page = await freshPage(browser, viewport);
  await assertSheet(page, "initial");
  const sheet = page.locator('[data-testid="onboarding-sheet"]');
  await page.screenshot({
    path: path.join(outDir, "onboarding-one-initial-390x844.png"),
    fullPage: false,
  });

  await sheet.getByRole("button", { name: "Kaufland" }).click();
  await page.waitForTimeout(200);
  const toggle = page.locator('[data-testid="onboarding-flyer-toggle"]');
  if ((await toggle.count()) !== 1) {
    throw new Error("Kaufland: expected flyer toggle");
  }
  await page.screenshot({
    path: path.join(outDir, "onboarding-one-kaufland-toggle-390x844.png"),
    fullPage: false,
  });

  await sheet.getByRole("button", { name: "Kaufland" }).click();
  await sheet.getByRole("button", { name: "Konzum" }).click();
  await page.waitForTimeout(200);
  if ((await toggle.count()) !== 0) {
    throw new Error("Konzum-only: flyer toggle must be hidden");
  }
  await page.screenshot({
    path: path.join(outDir, "onboarding-one-konzum-no-toggle-390x844.png"),
    fullPage: false,
  });

  // Gotovo vidljiv u viewportu (bez skrola).
  const done = page.locator('[data-testid="onboarding-done"]');
  const box = await done.boundingBox();
  if (!box || box.y + box.height > 844) {
    throw new Error(`Gotovo not fully visible: ${JSON.stringify(box)}`);
  }
  await page.close();
}

{
  const page = await freshPage(browser, viewport);
  await page.evaluate(() => {
    localStorage.setItem(
      "akcije_favorites",
      JSON.stringify([["p1", { id: "p1", name: "Test" }]])
    );
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await assertNoSheet(page, "fav");
  await page.screenshot({
    path: path.join(outDir, "onboarding-hidden-favorites-390.png"),
    fullPage: false,
  });
  await page.close();
}

{
  const page = await browser.newPage({
    viewport,
    deviceScaleFactor: 2,
  });
  await page.goto(BASE + "/?shot=1", {
    waitUntil: "domcontentloaded",
  });
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE + "/?trgovina=Konzum&shot=1", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await assertNoSheet(page, "trgovina");
  await page.screenshot({
    path: path.join(outDir, "onboarding-hidden-trgovina-390.png"),
    fullPage: false,
  });
  await page.close();
}

await browser.close();
console.log("OK shot-onboarding →", outDir);
