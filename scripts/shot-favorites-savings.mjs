import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "_tmp_search_shots");
fs.mkdirSync(outDir, { recursive: true });

// Matches user example-ish: 38.68 / 9.34 / 29.34
const sample = [
  [
    "fav-1",
    {
      id: "fav-1",
      name: "Mlijeko 1L",
      salePrice: 4.2,
      originalPrice: 12.5,
      discount: 66,
      store: "Lidl",
      image: "",
      imageBg: "#0d1f3a",
    },
  ],
  [
    "fav-2",
    {
      id: "fav-2",
      name: "Jogurt 150g",
      salePrice: 3.5,
      originalPrice: 15.0,
      discount: 77,
      store: "Konzum",
      image: "",
      imageBg: "#0d1f3a",
    },
  ],
  [
    "fav-3",
    {
      id: "fav-3",
      name: "Kruh",
      salePrice: 1.64,
      originalPrice: 11.18,
      discount: 85,
      store: "Spar",
      image: "",
      imageBg: "#0d1f3a",
    },
  ],
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 2,
});
await page.addInitScript((entries) => {
  localStorage.setItem("akcije_favorites", JSON.stringify(entries));
}, sample);
await page.goto("http://localhost:5173/", {
  waitUntil: "domcontentloaded",
  timeout: 30000,
});
await page.waitForTimeout(2000);
await page.getByRole("button", { name: /Favoriti/i }).click();
await page.waitForTimeout(600);
await page.getByText("TVOJA UŠTEDA").waitFor({ timeout: 10000 });

const card = page
  .locator("text=TVOJA UŠTEDA")
  .locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
const box = await card.boundingBox();
const out = path.join(outDir, "favorites-savings-totals.png");
await page.screenshot({
  path: out,
  clip: box
    ? {
        x: Math.max(0, box.x - 8),
        y: Math.max(0, box.y - 8),
        width: Math.min(375, box.width + 16),
        height: box.height + 16,
      }
    : undefined,
});
console.log(await card.innerText());
console.log("wrote", out);
await browser.close();
