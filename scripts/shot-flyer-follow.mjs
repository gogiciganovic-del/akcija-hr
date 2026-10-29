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
const offCap = (await barOff.textContent()) || "";
if (!offCap.includes("Najviše jedna obavijest tjedno po trgovini")) {
  throw new Error(`expected off caption, got ${JSON.stringify(offCap)}`);
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
const barOn = page.locator('[data-testid="store-info-bar"]');
const onCap = (await barOn.textContent()) || "";
if (!onCap.includes("Dodirni za prekid praćenja")) {
  throw new Error(`expected on caption, got ${JSON.stringify(onCap)}`);
}
await barOn.screenshot({
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

// --- Greška (nije odbijena dozvola): lažni endpoint → follow RPC padne → mirna poruka ---
const browserErr = await chromium.launch({ headless: true, channel: "chrome" });
const pageErr = await browserErr.newPage({
  viewport: { width: 360, height: 740 },
  deviceScaleFactor: 2,
});
await pageErr.addInitScript(() => {
  try {
    Object.defineProperty(Notification, "permission", {
      configurable: true,
      get: () => "granted",
    });
  } catch {
    // ignore
  }
});
await pageErr.goto("http://127.0.0.1:5173/", {
  waitUntil: "domcontentloaded",
  timeout: 30000,
});
await pageErr.evaluate(() => {
  localStorage.clear();
  // Postoji "pretplata" → skip enable; RPC će pasti zbog route.abort ispod.
  localStorage.setItem(
    "cjenko_push_endpoint",
    "https://example.invalid/push/fake-endpoint-for-shot"
  );
});
// Blokiraj Supabase RPC/REST → followChain baca → mirna poruka (nije denied).
await pageErr.route("**/*supabase.co/**", (route) => route.abort());
await pageErr.route("**/rest/v1/**", (route) => route.abort());
await pageErr.goto("http://127.0.0.1:5173/?trgovina=Kaufland", {
  waitUntil: "networkidle",
  timeout: 30000,
});
await pageErr.waitForSelector('[data-testid="flyer-follow-btn"]', {
  timeout: 15000,
});
await pageErr.waitForFunction(() => {
  const b = document.querySelector('[data-testid="flyer-follow-btn"]');
  return b && !b.disabled;
}, null, { timeout: 15000 });
await pageErr.locator('[data-testid="flyer-follow-btn"]').click();
await pageErr.waitForSelector('[data-testid="flyer-follow-enable-error"]', {
  state: "visible",
  timeout: 15000,
});
const errText =
  (await pageErr.locator('[data-testid="flyer-follow-enable-error"]').textContent()) ||
  "";
if (!errText.includes("Ne mogu uključiti obavijesti")) {
  throw new Error(`expected enable fail msg, got ${JSON.stringify(errText)}`);
}
await pageErr.locator('[data-testid="store-info-bar"]').screenshot({
  path: path.join(outDir, "flyer-follow-enable-error-360x740.png"),
});
await browserErr.close();

console.log("OK shot-flyer-follow → _tmp_search_shots/flyer-follow-*-360x740.png");
