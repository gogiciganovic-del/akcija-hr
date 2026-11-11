/**
 * Blagdanska košarica shots (390×844, dpr 2).
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

await page.getByText("BLAGDANSKA KOŠARICA").waitFor({ timeout: 10000 });
await page.locator('[data-testid="holiday-cart-blagdansko-pecenje"]').waitFor({
  state: "visible",
  timeout: 5000,
});

const emptyOut = path.join(outDir, "holiday-cart-empty-390x844.png");
await page.screenshot({ path: emptyOut, fullPage: false });
console.log("wrote", path.basename(emptyOut));

await page.locator('[data-testid="holiday-cart-blagdansko-pecenje"]').click();
await page.getByText("brašno 1 kg").first().waitFor({ timeout: 20000 });
await page.getByText(/Košarica u/i).waitFor({ timeout: 90000 });
const hint = page.locator('[data-testid="holiday-compare-hint"]');
await hint.waitFor({ state: "visible", timeout: 10000 });
await hint.scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
const afterOut = path.join(outDir, "holiday-cart-after-add-390x844.png");
await page.screenshot({ path: afterOut, fullPage: false });
console.log("wrote", path.basename(afterOut));
const hintText = await hint.innerText();
console.log("hint:", hintText);

await browser.close();
console.log("OK shot-holiday-carts");
