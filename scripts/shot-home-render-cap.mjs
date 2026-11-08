/**
 * Screenshot: napomena na kraju „Sve akcije” (375×812).
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
const note = page.locator('[data-testid="home-actions-truncation-note"]');

// Klikaj „Prikaži još” dok se ne pojavi napomena (max ~30 × 48)
for (let i = 0; i < 35; i++) {
  if (await note.count()) break;
  if (!(await more.count())) break;
  await more.click();
  await page.waitForTimeout(120);
}

await note.waitFor({ timeout: 15000 });
await note.scrollIntoViewIfNeeded();
await page.waitForTimeout(400);

const out = path.join(outDir, "home-all-actions-truncation-375.png");
const box = await note.boundingBox();
if (box) {
  const y = Math.max(0, box.y - 200);
  await page.screenshot({
    path: out,
    clip: {
      x: 0,
      y,
      width: 375,
      height: Math.min(812, box.y + box.height + 40 - y),
    },
  });
} else {
  await page.screenshot({ path: out, fullPage: false });
}

console.log("Saved:", out);
await browser.close();
