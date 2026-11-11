/**
 * Home first-view fold shot (390×844, dpr 2).
 * Usage: node scripts/shot-home-first-view.mjs before|after
 * Pretpostavlja Vite DEV na http://127.0.0.1:5173
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const label = String(process.argv[2] || "shot").trim() || "shot";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "_tmp_search_shots");
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});

await page.goto("http://127.0.0.1:5173/?notrack=1", {
  waitUntil: "domcontentloaded",
  timeout: 30000,
});
await page.evaluate(() => {
  localStorage.clear();
  localStorage.setItem("cjenko_onboarding_done", "1");
  localStorage.setItem("umami.disabled", "1");
});
await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });

await page.waitForFunction(
  () => {
    const h2 = [...document.querySelectorAll("h2")].some((el) => {
      const t = el.textContent || "";
      return t.includes("Ponuda dana") || t.includes("Vruće ponude");
    });
    return h2 && !document.querySelector('[data-testid="onboarding-root"]');
  },
  { timeout: 35000 }
);
await page.waitForTimeout(900);

const out = path.join(outDir, `home-first-view-${label}-390x844.png`);
await page.screenshot({ path: out, fullPage: false });
console.log("wrote", out);

const fold = await page.evaluate(() => {
  const vh = window.innerHeight;
  const cards = [...document.querySelectorAll(".relative.rounded-2xl.overflow-hidden")];
  const above = cards.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.top < vh && r.bottom > 40 && r.height > 40;
  }).length;
  const value = [...document.querySelectorAll("p")].find((el) =>
    (el.textContent || "").includes("trgovina")
  );
  return {
    vh,
    cardsAboveFold: above,
    hasValueLine: Boolean(value),
    valueText: value?.textContent?.trim() || null,
  };
});
console.log("fold", JSON.stringify(fold));

await browser.close();
