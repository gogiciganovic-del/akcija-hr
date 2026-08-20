/**
 * Screenshot nakon backfilla barkoda na deals (Toblerone, Podravka pekmez).
 * Usage: node scripts/shot-deal-barcode-backfill.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { readFileSync, existsSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "_tmp_search_shots");
mkdirSync(outDir, { recursive: true });

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    )
      v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}
loadEnv(path.join(root, ".env"));

const sb = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function verifyDeal(nameLike, chainHint) {
  const { data, error } = await sb
    .from("active_deals")
    .select("name, barcode, store_name, price, image_url")
    .ilike("name", `${nameLike}%`)
    .limit(20);
  if (error) throw error;
  const row = (data || []).find((d) =>
    String(d.store_name || "").toLowerCase().includes(chainHint.toLowerCase())
  );
  console.log(
    "DB",
    nameLike,
    "→",
    row
      ? {
          barcode: row.barcode,
          price: row.price,
          hasImage: Boolean(row.image_url),
          store: row.store_name,
        }
      : null
  );
  return row;
}

await verifyDeal("Toblerone", "Kaufland");
await verifyDeal("Podravka Pekmez", "Kaufland");

async function shot(draft, filename) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 390, height: 900 },
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
  await page.getByText("AKCIJA", { exact: true }).first().waitFor({
    timeout: 90000,
  });
  await page.waitForTimeout(1200);
  // Prefer results area with others (images)
  const others = page.getByText("ISTA KOŠARICA DRUGDJE");
  if (await others.count()) {
    await others.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
  }
  await page.locator("main").first().screenshot({
    path: path.join(outDir, filename),
  });
  const text = await page.locator("body").innerText();
  const imgCount = await page.locator("main img").count();
  console.log(
    filename,
    "AKCIJA=",
    text.includes("AKCIJA"),
    "imgs=",
    imgCount,
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
        name: "Toblerone čokolada 100 g",
        barcode: "7614500010013",
        price: 2.99,
        originalPrice: 2.99,
        priceSource: "regular",
      },
    ],
  },
  "cart-barcode-backfill-toblerone.png"
);

await shot(
  {
    selectedChain: "Kaufland",
    items: [
      {
        id: "2",
        name: "Podravka Pekmez od šljiva 660 g",
        barcode: "3856020252847",
        price: 3.59,
        originalPrice: 3.59,
        priceSource: "regular",
      },
    ],
  },
  "cart-barcode-backfill-pekmez.png"
);

console.log("done →", outDir);
