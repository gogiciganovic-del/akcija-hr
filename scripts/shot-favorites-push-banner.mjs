/**
 * Favoriti push banner (prompt/"default"):
 * - favorit bez barkoda → banner skriven
 * - favorit s barkodom → banner „Uključi obavijesti…” vidljiv
 * 390×844. Pretpostavlja Vite na 127.0.0.1:5173
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "_tmp_search_shots");
fs.mkdirSync(outDir, { recursive: true });

const BASE = process.env.CJENKO_URL || "http://127.0.0.1:5173";

const noBarcode = [
  [
    "fav-nb-1",
    {
      id: "fav-nb-1",
      name: "Mlijeko 1L",
      salePrice: 0.89,
      originalPrice: 1.29,
      discount: 31,
      store: "Lidl",
      image: "",
      imageBg: "#0d1f3a",
    },
  ],
];

const withBarcode = [
  [
    "fav-bc-1",
    {
      id: "fav-bc-1",
      name: "Maslac 250g",
      salePrice: 1.99,
      originalPrice: 2.89,
      discount: 31,
      store: "Spar",
      barcode: "3858882123456",
      image: "",
      imageBg: "#0d1f3a",
    },
  ],
];

async function openFav(page, entries) {
  await page.goto(BASE + "/?shot=1", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.evaluate((fav) => {
    localStorage.clear();
    localStorage.setItem("cjenko_onboarding_done", "1");
    localStorage.setItem("akcije_favorites", JSON.stringify(fav));
  }, entries);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: /Favoriti/i }).click();
  await page.waitForTimeout(700);
  await page.getByText("Tvoji favoriti").waitFor({ timeout: 10000 });
}

const browser = await chromium.launch({ headless: true, channel: "chrome" });

{
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  // Bez grantane dozvole → status "prompt" (enable CTA).
  await openFav(page, noBarcode);
  const enableBtn = page.getByRole("button", {
    name: /Uključi obavijesti o padu cijene/i,
  });
  if ((await enableBtn.count()) !== 0) {
    throw new Error("no-barcode: expected push enable banner hidden");
  }
  await page.screenshot({
    path: path.join(outDir, "favorites-push-prompt-no-barcode-390x844.png"),
    fullPage: false,
  });
  await page.close();
  console.log("OK favorites-push-prompt-no-barcode-390x844.png");
}

{
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  await openFav(page, withBarcode);
  const enableBtn = page.getByRole("button", {
    name: /Uključi obavijesti o padu cijene/i,
  });
  await enableBtn.waitFor({ state: "visible", timeout: 5000 });
  await page.screenshot({
    path: path.join(outDir, "favorites-push-prompt-with-barcode-390x844.png"),
    fullPage: false,
  });
  await page.close();
  console.log("OK favorites-push-prompt-with-barcode-390x844.png");
}

await browser.close();
console.log("OK shot-favorites-push-banner →", outDir);
