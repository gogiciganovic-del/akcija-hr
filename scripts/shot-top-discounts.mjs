/**
 * BF traka na Homeu (390×844, dpr 2) uz DEV ?bf=1.
 * Pretpostavlja Vite DEV na http://127.0.0.1:5173.
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "_tmp_search_shots");
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});

await page.goto("http://127.0.0.1:5173/?shot=1&notrack=1&bf=1", {
  waitUntil: "domcontentloaded",
  timeout: 30000,
});
await page.evaluate(() => {
  localStorage.clear();
  localStorage.setItem("cjenko_onboarding_done", "1");
  localStorage.setItem("umami.disabled", "1");
});
await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });

await page.getByText("Najveći popusti ovaj tjedan").waitFor({ timeout: 60000 });
await page.waitForTimeout(800);

const foldOut = path.join(outDir, "bf-strip-home-fold-390x844.png");
await page.screenshot({ path: foldOut, fullPage: false });
console.log("wrote", path.basename(foldOut));

const strip = page.locator('[data-testid="home-top-discounts"]');
await strip.scrollIntoViewIfNeeded();
const cards = page.locator('[data-testid="home-top-discount-card"]');
const n = await cards.count();
const list = [];
for (let i = 0; i < n; i++) {
  const el = cards.nth(i);
  list.push({
    chain: await el.getAttribute("data-chain"),
    discount: await el.getAttribute("data-discount"),
  });
}
console.log("STRIP", JSON.stringify(list));

if (n > 2) {
  await cards.nth(Math.min(n - 1, 4)).scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
}
const scrollOut = path.join(outDir, "bf-strip-home-scrolled-390x844.png");
await page.screenshot({ path: scrollOut, fullPage: false });
console.log("wrote", path.basename(scrollOut));

await browser.close();
console.log("OK shot-top-discounts");
