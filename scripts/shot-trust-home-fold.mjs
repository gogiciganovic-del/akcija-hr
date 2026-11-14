/**
 * Trust-polish home fold: 390×844 dpr 2 — first Ponuda dana card above fold?
 * Usage: node scripts/shot-trust-home-fold.mjs before|after
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
    const h2 = [...document.querySelectorAll("h2")].some((el) =>
      (el.textContent || "").includes("Ponuda dana")
    );
    return h2 && !document.querySelector('[data-testid="onboarding-root"]');
  },
  { timeout: 45000 }
);
await page.waitForTimeout(1000);

const metrics = await page.evaluate(() => {
  const vh = window.innerHeight;
  const section = document.querySelector('[data-testid="home-daily-picks-early"]');
  const firstCard = section?.querySelector(".relative.rounded-2xl.overflow-hidden");
  const r = firstCard?.getBoundingClientRect();
  const storesLabel = [...document.querySelectorAll("p")].some(
    (el) => (el.textContent || "").trim() === "TRGOVINE"
  );
  const valueLine = document.querySelector('[data-testid="home-value-line"]');
  return {
    vh,
    firstCardTop: r ? Math.round(r.top) : null,
    firstCardBottom: r ? Math.round(r.bottom) : null,
    firstCardVisibleWithoutScroll: Boolean(r && r.top >= 0 && r.top < vh - 80),
    hasTrgovineLabel: storesLabel,
    hasValueLine: Boolean(valueLine),
  };
});

const out = path.join(outDir, `home-first-view-trust-${label}-390x844.png`);
await page.screenshot({ path: out, fullPage: false });
console.log("wrote", out);
console.log("fold", JSON.stringify(metrics));

await browser.close();
if (!metrics.firstCardVisibleWithoutScroll) {
  console.error("FAIL: first Ponuda dana card not clearly above fold");
  process.exit(1);
}
console.log("OK shot-trust-home-fold", label);
