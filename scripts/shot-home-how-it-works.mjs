/**
 * Screenshot: "Kako radi Cjenko" sekcija na mobilnoj širini.
 * Usage: node scripts/shot-home-how-it-works.mjs
 */
import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "_tmp_search_shots");
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 2,
});

await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded", timeout: 25000 });
await page.waitForTimeout(1500);

const heading = page.getByText("Kako radi Cjenko");
await heading.waitFor({ timeout: 10000 });
const box = await heading.evaluate((el) => {
  const section = el.closest(".mx-4") || el.parentElement;
  const r = section.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
});

const out375 = path.join(outDir, "home-how-it-works-375.png");
await page.screenshot({
  path: out375,
  clip: {
    x: Math.max(0, box.x - 8),
    y: Math.max(0, box.y - 4),
    width: Math.min(375, box.width + 16),
    height: box.height + 8,
  },
});

// iPhone SE width
await page.setViewportSize({ width: 320, height: 568 });
await page.waitForTimeout(400);
const box320 = await heading.evaluate((el) => {
  const section = el.closest(".mx-4") || el.parentElement;
  const r = section.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
});
const out320 = path.join(outDir, "home-how-it-works-320.png");
await page.screenshot({
  path: out320,
  clip: {
    x: Math.max(0, box320.x - 8),
    y: Math.max(0, box320.y - 4),
    width: Math.min(320, box320.width + 16),
    height: box320.height + 8,
  },
});

await browser.close();
console.log("Saved:", out375);
console.log("Saved:", out320);
