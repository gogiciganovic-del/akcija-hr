/**
 * Screenshot ProductSheet: redovna + akcija (390px) — SourceBadge + datum.
 * Pretpostavlja Vite DEV (`npm run dev`) na http://127.0.0.1:5173 (?shot=1).
 * Pokreni: node scripts/shot-price-trust-sheet.mjs
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "_tmp_search_shots");
fs.mkdirSync(outDir, { recursive: true });

const freshIso = new Date().toISOString();

const regular = {
  id: "shot-regular",
  name: "Mlijeko 2,8% 1 L",
  chain: "Konzum",
  store: "Konzum",
  salePrice: 1.09,
  originalPrice: 1.09,
  discount: 0,
  image: "",
  imageBg: "#0d1f3a",
  priceSource: "regular",
  scrapedAt: freshIso,
  category: "mliječni",
  barcode: "3850123456789",
};

const sale = {
  id: "shot-sale",
  name: "Nutella 400 g",
  chain: "Lidl",
  store: "Lidl",
  salePrice: 3.49,
  originalPrice: 4.99,
  discount: 30,
  image: "",
  imageBg: "#0d1f3a",
  priceSource: "sale",
  scrapedAt: "2026-11-01T12:00:00Z",
  category: "namazi",
  barcode: null,
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});

await page.goto("http://127.0.0.1:5173/?shot=1", {
  waitUntil: "domcontentloaded",
  timeout: 30000,
});
await page.waitForTimeout(700);

async function openAndShot(product, fileName, expectText) {
  await page.evaluate((p) => {
    if (typeof window.__cjenkoOpenProductSheet !== "function") {
      throw new Error("missing __cjenkoOpenProductSheet — open with ?shot=1");
    }
    window.__cjenkoOpenProductSheet(p);
  }, product);
  await page.waitForTimeout(500);
  const sheet = page.locator(".fixed.inset-0.z-50 .relative.rounded-t-3xl").first();
  await sheet.waitFor({ state: "visible", timeout: 10000 });
  const body = (await sheet.textContent()) || "";
  for (const t of expectText) {
    if (!body.includes(t)) throw new Error(`${fileName}: missing ${JSON.stringify(t)}`);
  }
  const out = path.join(outDir, fileName);
  await sheet.screenshot({ path: out });
  console.log("wrote", out);
  const closeBtn = sheet.locator('button[aria-label="Zatvori"]');
  if (await closeBtn.count()) await closeBtn.click();
  await page.evaluate(() => {
    window.__cjenkoOpenProductSheet?.(null);
  });
  await page.waitForTimeout(300);
}

await openAndShot(regular, "product-sheet-price-trust-regular.png", [
  "REDOVNA",
  "Cijena iz cjenika od",
]);
await openAndShot(sale, "product-sheet-price-trust-sale.png", ["AKCIJA", "Ažurirano"]);

await browser.close();
console.log("OK shot-price-trust-sheet");
