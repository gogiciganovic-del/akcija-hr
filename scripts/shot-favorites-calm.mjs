/**
 * Favoriti calm: 390×844 — bez barkoda vs s barkodom (bez „Ne prati se · Skeniraj”).
 * Pretpostavlja Vite na http://127.0.0.1:5173
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
      name: "Mlijeko 1L Akcija",
      salePrice: 0.89,
      originalPrice: 1.29,
      discount: 31,
      store: "Lidl",
      image: "",
      imageBg: "#0d1f3a",
    },
  ],
  [
    "fav-nb-2",
    {
      id: "fav-nb-2",
      name: "Jogurt 150g",
      salePrice: 0.45,
      originalPrice: 0.79,
      discount: 43,
      store: "Konzum",
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
  [
    "fav-bc-2",
    {
      id: "fav-bc-2",
      name: "Kruh bijeli",
      salePrice: 0.79,
      originalPrice: 1.19,
      discount: 34,
      store: "Plodine",
      barcode: "3850123456789",
      image: "",
      imageBg: "#0d1f3a",
    },
  ],
];

async function shoot(entries, outName) {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
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
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /Favoriti/i }).click();
  await page.waitForTimeout(700);
  await page.getByText("Tvoji favoriti").waitFor({ timeout: 10000 });

  const badge = await page.getByText("Ne prati se").count();
  if (badge !== 0) {
    throw new Error(`${outName}: expected no \"Ne prati se\" badge, got ${badge}`);
  }

  await page.screenshot({
    path: path.join(outDir, outName),
    fullPage: false,
  });
  await browser.close();
  console.log("OK", outName);
}

await shoot(noBarcode, "favorites-calm-no-barcode-390x844.png");
await shoot(withBarcode, "favorites-calm-with-barcode-390x844.png");
console.log("OK shot-favorites-calm →", outDir);
