/**
 * Screenshot: sale match nakon normalizeDealNameKey u findSaleExact.
 * Usage: node scripts/shot-sale-suffix-match.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "_tmp_search_shots");
mkdirSync(outDir, { recursive: true });

async function shot(draft, filename) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  await page.addInitScript((payload) => {
    localStorage.setItem("cjenko_cart_draft_v1", JSON.stringify(payload));
  }, draft);
  await page.goto("http://localhost:5173/", {
    waitUntil: "domcontentloaded",
    timeout: 20000,
  });
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: /Košarica/i }).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /Izračunaj košaricu/i }).click();
  // Primarni rezultat: badge AKCIJA ili cijena
  await page.getByText("AKCIJA", { exact: true }).first().waitFor({
    timeout: 90000,
  });
  await page.waitForTimeout(800);
  const badge = page.getByText("AKCIJA", { exact: true }).first();
  await badge.scrollIntoViewIfNeeded();
  // Screenshot cijele košarice (rezultat), ne samo badge
  const main = page.locator("main").first();
  await main.screenshot({ path: path.join(outDir, filename) });
  const bodyText = await page.locator("body").innerText();
  const hasAkcija = bodyText.includes("AKCIJA");
  const hasName = draft.items.some((it) =>
    bodyText.toLowerCase().includes(String(it.name).slice(0, 20).toLowerCase())
  );
  console.log(
    filename,
    "AKCIJA=",
    hasAkcija,
    "nameVisible=",
    hasName,
    "item=",
    draft.items[0].name
  );
  await browser.close();
}

await shot(
  {
    selectedChain: "Kaufland",
    items: [
      {
        id: "1",
        name: "Podravka mesni narezak 150 g",
        barcode: "3859890848196",
        price: 1.89,
        originalPrice: 1.89,
        priceSource: "regular",
      },
    ],
  },
  "cart-sale-suffix-podravka.png"
);

await shot(
  {
    selectedChain: "Spar",
    items: [
      {
        id: "2",
        name: "PAŠTETA OD TUNE SPAR 95 g",
        barcode: "3856021200274",
        price: 1.55,
        originalPrice: 1.55,
        priceSource: "regular",
      },
    ],
  },
  "cart-sale-suffix-pasteta.png"
);

console.log("done");
