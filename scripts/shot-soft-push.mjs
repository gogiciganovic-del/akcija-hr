/**
 * Soft push snackbar + Home fade (390×844, dpr 2).
 * Pretpostavlja Vite DEV na http://127.0.0.1:5173 (?shot=1).
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
await page.waitForTimeout(900);

await page.waitForFunction(
  () => typeof window.__cjenkoOpenSoftPush === "function",
  { timeout: 15000 }
);

await page.evaluate(() => {
  window.__cjenkoOpenSoftPush({
    kind: "price",
    barcode: "3850123456789",
    message: "Obavijesti me kad cijena padne",
  });
});
await page.waitForTimeout(400);
const snack = page.locator('[data-testid="soft-push-snackbar"]');
await snack.waitFor({ state: "visible", timeout: 5000 });
await page.screenshot({
  path: path.join(outDir, "soft-push-snackbar-390x844.png"),
  fullPage: false,
});
console.log("wrote soft-push-snackbar-390x844.png");

await page.evaluate(() => window.__cjenkoOpenSoftPush?.(null));
await page.waitForTimeout(300);

await page.waitForFunction(
  () =>
    [...document.querySelectorAll("h2")].some((el) =>
      (el.textContent || "").includes("Ponuda dana")
    ),
  { timeout: 25000 }
);
const fade = page.locator('[data-testid="home-stores-fade"]');
await fade.waitFor({ state: "attached", timeout: 5000 });
await page.screenshot({
  path: path.join(outDir, "soft-push-home-fade-390x844.png"),
  fullPage: false,
});
console.log("wrote soft-push-home-fade-390x844.png");

await browser.close();
console.log("OK shot-soft-push");
