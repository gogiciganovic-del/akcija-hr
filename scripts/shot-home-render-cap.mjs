/**
 * Screenshot: „Sve akcije” s gumbom Prikaži još (375×812).
 * Usage: node scripts/shot-home-render-cap.mjs
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

await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.evaluate(() => {
  localStorage.clear();
  localStorage.setItem("cjenko_onboarding_done", "1");
});
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);

const section = page.locator('[data-testid="home-all-actions"]');
await section.waitFor({ timeout: 25000 });
const more = page.locator('[data-testid="home-actions-show-more"]');
await more.waitFor({ timeout: 15000 });
await more.scrollIntoViewIfNeeded();
await page.waitForTimeout(500);

const out = path.join(outDir, "home-all-actions-375.png");
const moreBox = await more.boundingBox();
if (moreBox) {
  const y = Math.max(0, moreBox.y - 420);
  await page.screenshot({
    path: out,
    clip: {
      x: 0,
      y,
      width: 375,
      height: Math.min(812, moreBox.y + moreBox.height + 24 - y),
    },
  });
} else {
  await page.screenshot({ path: out, fullPage: false });
}

console.log("Saved:", out);
await browser.close();
