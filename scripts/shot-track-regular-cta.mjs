/**
 * Screenshot ProductSheet CTA: s barkodom i bez (390px).
 * Pretpostavlja vite na http://127.0.0.1:5173
 * Pokreni: node scripts/shot-track-regular-cta.mjs
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "_tmp_search_shots");
fs.mkdirSync(outDir, { recursive: true });

const base = {
  id: "shot-1",
  name: "Test mlijeko 1 L",
  chain: "Konzum",
  store: "Konzum",
  salePrice: 1.29,
  originalPrice: 1.49,
  discount: 13,
  image: "",
  imageBg: "#0d1f3a",
  priceSource: "regular",
  category: "mliječni",
};

const withBarcode = { ...base, barcode: "3850123456789" };
const withoutBarcode = { ...base, id: "shot-2", barcode: null };

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

async function openAndShot(product, fileName, expectCta) {
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
  const hasCta = /Obavijesti me kad padne redovna cijena|Pratim redovnu cijenu/.test(
    body
  );
  if (expectCta && !hasCta) throw new Error(`${fileName}: expected track CTA`);
  if (!expectCta && hasCta) throw new Error(`${fileName}: unexpected track CTA`);
  const out = path.join(outDir, fileName);
  await sheet.screenshot({ path: out });
  console.log("wrote", out);
  await page.keyboard.press("Escape").catch(() => {});
  await page.evaluate(() => {
    window.__cjenkoOpenProductSheet?.(null);
  });
  // close via X
  const closeBtn = sheet.locator('button[aria-label="Zatvori"]');
  if (await closeBtn.count()) await closeBtn.click();
  await page.waitForTimeout(300);
}

await openAndShot(withBarcode, "product-sheet-track-cta-with-barcode.png", true);
await openAndShot(withoutBarcode, "product-sheet-track-cta-no-barcode.png", false);

await browser.close();
console.log("OK shot-track-regular-cta");
