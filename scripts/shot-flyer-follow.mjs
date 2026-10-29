/**
 * Screenshot StoreInfoBar flyer gumba (360x740):
 * Kaufland off, Kaufland on, Lidl (nema gumba).
 * Pretpostavlja vite na 127.0.0.1:5173
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "../_tmp_search_shots");
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({
  viewport: { width: 360, height: 740 },
  deviceScaleFactor: 2,
});

await page.addInitScript(() => {
  try {
    Object.defineProperty(Notification, "permission", {
      configurable: true,
      get: () => "granted",
    });
  } catch {
    // ignore
  }
});

async function openViaTrgovina(chain) {
  await page.goto(`http://127.0.0.1:5173/?trgovina=${encodeURIComponent(chain)}`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForSelector('[data-testid="store-info-bar"]', { timeout: 15000 });
  await page.waitForTimeout(500);
}

// Kaufland — isključeno (gumb vidljiv, ne prati)
await page.goto("http://127.0.0.1:5173/", {
  waitUntil: "domcontentloaded",
  timeout: 30000,
});
await page.evaluate(() => localStorage.clear());
await openViaTrgovina("Kaufland");

const barOff = page.locator('[data-testid="store-info-bar"]');
await barOff.screenshot({
  path: path.join(outDir, "flyer-follow-kaufland-off-360x740.png"),
});
const btnOff = page.locator('[data-testid="flyer-follow-btn"]');
const offText = (await btnOff.textContent()) || "";
if (!offText.includes("Obavijesti me")) {
  throw new Error(`expected off CTA, got ${JSON.stringify(offText)}`);
}

// Uključi lokalno zrcalo pa reload stanja gumba
await page.evaluate(() => {
  localStorage.setItem(
    "cjenko_push_followed_chains",
    JSON.stringify(["Kaufland"])
  );
});
await openViaTrgovina("Kaufland");
const onText = (await page.locator('[data-testid="flyer-follow-btn"]').textContent()) || "";
if (!onText.includes("Pratiš letak")) {
  throw new Error(`expected on CTA, got ${JSON.stringify(onText)}`);
}
await page.locator('[data-testid="store-info-bar"]').screenshot({
  path: path.join(outDir, "flyer-follow-kaufland-on-360x740.png"),
});

// Lidl — gumba ne smije biti
await openViaTrgovina("Lidl");
const lidlBtn = await page.locator('[data-testid="flyer-follow-btn"]').count();
if (lidlBtn !== 0) throw new Error("Lidl must not show flyer follow button");
await page.locator('[data-testid="store-info-bar"]').screenshot({
  path: path.join(outDir, "flyer-follow-lidl-none-360x740.png"),
});

await browser.close();
console.log("OK shot-flyer-follow → _tmp_search_shots/flyer-follow-*-360x740.png");
