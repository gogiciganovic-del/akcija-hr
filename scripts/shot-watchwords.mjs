/**
 * Screenshot: odjeljak „Za tebe” na mobilnoj širini (375×812).
 * Usage: node scripts/shot-watchwords.mjs
 * Pretpostavlja vite na 127.0.0.1:5173.
 */
import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "_tmp_search_shots");
fs.mkdirSync(outDir, { recursive: true });

const BASE = process.env.CJENKO_URL || "http://127.0.0.1:5173";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 2,
});

await page.goto(BASE + "/", {
  waitUntil: "domcontentloaded",
  timeout: 30000,
});
await page.evaluate(() => localStorage.clear());
await page.evaluate(() => {
  localStorage.setItem(
    "cjenko_watchwords",
    JSON.stringify(["kava", "nutella", "pelene"])
  );
  // Spriječi onboarding sheet da zakrije home
  localStorage.setItem("cjenko_onboarding_done", "1");
});
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);

const section = page.locator('[data-testid="watchwords-section"]');
await section.waitFor({ timeout: 20000 });
// Pričekaj kraj skeleton-a (dedicated active_deals upiti)
await page
  .locator('[data-testid="watchwords-section"]')
  .getByText(/€|Trenutno nema aktivnih|Ne mogu učitati/)
  .first()
  .waitFor({ timeout: 25000 })
  .catch(() => {});
await page.waitForTimeout(800);
await page.evaluate(() => {
  const el = document.querySelector('[data-testid="watchwords-section"]');
  el?.scrollIntoView({ block: "start" });
});
await page.waitForTimeout(400);

const box = await section.boundingBox();
const out = path.join(outDir, "home-watchwords-375.png");
if (box) {
  const height = Math.min(720, Math.max(280, box.height));
  await page.screenshot({
    path: out,
    clip: {
      x: Math.max(0, box.x),
      y: Math.max(0, box.y),
      width: Math.min(375, box.width + 4),
      height,
    },
  });
} else {
  await page.screenshot({ path: out, fullPage: false });
}

console.log("Saved:", out);
await browser.close();
