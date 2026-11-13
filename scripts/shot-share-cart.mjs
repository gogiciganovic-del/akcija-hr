/**
 * Share cart + missing-chains gray line (390×844, dpr 2).
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

await page.goto("http://127.0.0.1:5173/?shot=1&notrack=1", {
  waitUntil: "domcontentloaded",
  timeout: 30000,
});
await page.evaluate(() => {
  localStorage.clear();
  localStorage.setItem("cjenko_onboarding_done", "1");
  localStorage.setItem("umami.disabled", "1");
});
await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(1000);

await page.getByRole("button", { name: /Košarica/i }).click();
await page.waitForTimeout(500);

await page.getByRole("button", { name: /Npr\. Lidl/i }).click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: /^Lidl$/i }).click();
await page.waitForTimeout(600);

await page.locator('[data-testid="holiday-cart-bozicna-kosarica"]').click();
const primaryBanner = page.getByText(/Košarica u Lidl/i);
await primaryBanner.waitFor({ timeout: 90000 });
await page.waitForTimeout(1200);

const shareBtn = page.locator('[data-testid="share-cart"]');
await shareBtn.waitFor({ state: "visible", timeout: 30000 });
await shareBtn.scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
const shareOut = path.join(outDir, "share-cart-button-390x844.png");
await page.screenshot({ path: shareOut, fullPage: false });
console.log("wrote", path.basename(shareOut));

const missing = page.locator('[data-testid="barcode-cart-missing-chains"]');
await missing.waitFor({ state: "visible", timeout: 30000 });
await missing.scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
const missingOut = path.join(outDir, "share-cart-missing-chains-390x844.png");
await page.screenshot({ path: missingOut, fullPage: false });
console.log("wrote", path.basename(missingOut));

await browser.close();
console.log("OK shot-share-cart");
