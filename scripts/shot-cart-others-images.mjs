/**
 * Screenshot: ISTA KOŠARICA DRUGDJE — s slikom vs bez slike.
 * Usage: node scripts/shot-cart-others-images.mjs
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
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

loadEnv(path.join(root, ".env"));

const sb = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function pickWithImage() {
  // Exact deal name (with image) so Lidl resolve hits findSaleExact → image by name.
  const { data: deals, error } = await sb
    .from("active_deals")
    .select("name, store_name, image_url, price, original_price")
    .not("image_url", "is", null)
    .ilike("store_name", "%lidl%")
    .limit(40);
  if (error) throw error;

  for (const deal of deals || []) {
    const name = String(deal.name || "").trim();
    const img = String(deal.image_url || "").trim();
    if (!name || !img.startsWith("http")) continue;
    return {
      selectedChain: "Konzum",
      item: {
        id: "img1",
        name,
        barcode: null,
        price: Number(deal.price) || 1.99,
        originalPrice: Number(deal.original_price) || Number(deal.price) || 1.99,
        priceSource: "regular",
      },
      expectImage: true,
      note: "cart name = Lidl deal name (exact)",
    };
  }
  throw new Error("No Lidl deal with image_url");
}

async function pickWithoutImage() {
  // Same barcode in Konzum + Lidl regular, not present in active_deals by name/barcode.
  const { data: regs, error } = await sb
    .from("regular_prices")
    .select("name, barcode, chain, price")
    .eq("chain", "Konzum")
    .not("barcode", "is", null)
    .limit(200);
  if (error) throw error;

  for (const reg of regs || []) {
    const bc = String(reg.barcode || "").trim();
    const name = String(reg.name || "").trim();
    if (bc.length < 8 || !name) continue;

    const { data: lidl } = await sb
      .from("regular_prices")
      .select("name, barcode, price")
      .eq("chain", "Lidl")
      .eq("barcode", bc)
      .limit(1);
    if (!lidl?.length) continue;

    const { count: bcDeals } = await sb
      .from("active_deals")
      .select("deal_id", { count: "exact", head: true })
      .eq("barcode", bc);
    if (bcDeals > 0) continue;

    const lidlName = String(lidl[0].name || "").trim();
    const { count: nameDeals } = await sb
      .from("active_deals")
      .select("deal_id", { count: "exact", head: true })
      .in("name", [name, lidlName].filter(Boolean));
    if (nameDeals > 0) continue;

    return {
      selectedChain: "Konzum",
      item: {
        id: "noimg1",
        name,
        barcode: bc,
        price: Number(reg.price),
        originalPrice: Number(reg.price),
        priceSource: "regular",
      },
      expectImage: false,
      note: `Lidl hit: ${lidlName}`,
    };
  }
  throw new Error("No regular-only cross-chain product without deal image");
}

async function shotCase(label, pick, filename) {
  console.log(`\n=== ${label} ===`);
  console.log(
    JSON.stringify(
      {
        name: pick.item.name.slice(0, 80),
        barcode: pick.item.barcode,
        expectImage: pick.expectImage,
        note: pick.note,
      },
      null,
      2
    )
  );

  const draft = { selectedChain: pick.selectedChain, items: [pick.item] };
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 390, height: 920 },
    deviceScaleFactor: 2,
  });

  await page.addInitScript((payload) => {
    localStorage.setItem("cjenko_cart_draft_v1", JSON.stringify(payload));
  }, draft);

  await page.goto("http://localhost:5173/", {
    waitUntil: "domcontentloaded",
    timeout: 20000,
  });
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: /Košarica/i }).click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: /Izračunaj košaricu/i }).click();
  await page.getByText("ISTA KOŠARICA DRUGDJE").waitFor({ timeout: 90000 });
  await page.waitForTimeout(1500);

  const heading = page.getByText("ISTA KOŠARICA DRUGDJE");
  await heading.scrollIntoViewIfNeeded();
  const section = heading.locator("xpath=ancestor::div[1]");

  // Prefer Lidl row for with-image case
  const lidlRow = section.getByText("Lidl", { exact: true }).first();
  if (await lidlRow.count()) {
    await lidlRow.scrollIntoViewIfNeeded();
  }

  const thumbs = section.locator("ul img");
  const thumbCount = await thumbs.count();
  console.log(`thumbs in section: ${thumbCount}`);

  if (pick.expectImage && thumbCount < 1) {
    // dump a bit of text for debug
    const text = await section.innerText();
    console.log(text.slice(0, 800));
    throw new Error("Expected at least one product image thumbnail");
  }
  if (!pick.expectImage && thumbCount > 0) {
    console.warn("WARN: thumbs present but expected none");
  }

  await section.screenshot({ path: path.join(outDir, filename) });
  console.log("wrote", filename);
  await browser.close();
}

const withImg = await pickWithImage();
const withoutImg = await pickWithoutImage();
await shotCase("WITH image", withImg, "cart-others-with-image.png");
await shotCase("WITHOUT image", withoutImg, "cart-others-without-image.png");
console.log("\ndone ->", outDir);
