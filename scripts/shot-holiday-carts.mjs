/**
 * Božićna košarica shots (390×844, dpr 2).
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

await page.locator('[data-testid="holiday-cart-bozicna-kosarica"]').waitFor({
  state: "visible",
  timeout: 10000,
});

const emptyOut = path.join(outDir, "christmas-cart-empty-390x844.png");
await page.screenshot({ path: emptyOut, fullPage: false });
console.log("wrote", path.basename(emptyOut));

await page.locator('[data-testid="holiday-cart-bozicna-kosarica"]').click();
const primaryBanner = page.getByText(/Košarica u Lidl/i);
await primaryBanner.waitFor({ timeout: 90000 });
await primaryBanner.scrollIntoViewIfNeeded();
await page.getByText("isti barkod").first().waitFor({ timeout: 20000 });
await page.locator("img[src*='cdn.najcijena.hr']").first().waitFor({
  state: "visible",
  timeout: 15000,
});
await page.waitForTimeout(800);

const afterOut = path.join(outDir, "christmas-cart-after-add-390x844.png");
await page.screenshot({ path: afterOut, fullPage: false });
console.log("wrote", path.basename(afterOut));

// Lidl chain card area (primary already visible) — scroll to others Eurospin
const euro = page.getByText("Eurospin", { exact: true }).first();
await euro.scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
const euroMsg = page.getByText(/Eurospin ne vodi ove artikle u našoj bazi/i);
await euroMsg.waitFor({ state: "visible", timeout: 10000 });
const euroOut = path.join(outDir, "christmas-cart-eurospin-390x844.png");
await page.screenshot({ path: euroOut, fullPage: false });
console.log("wrote", path.basename(euroOut));

// One complete chain card (Konzum/Kaufland/Spar…)
const konzum = page.getByText("Konzum", { exact: true }).first();
await konzum.scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
const chainOut = path.join(outDir, "christmas-cart-chain-390x844.png");
await page.screenshot({ path: chainOut, fullPage: false });
console.log("wrote", path.basename(chainOut));

await browser.close();
console.log("OK shot-holiday-carts");
