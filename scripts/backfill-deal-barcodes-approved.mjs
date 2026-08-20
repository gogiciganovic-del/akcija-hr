/**
 * Backfill products.barcode for approved deal→catalog unique matches.
 * active_deals.barcode je VIEW stupac s products — upis ide u products.
 *
 * Usage: node scripts/backfill-deal-barcodes-approved.mjs
 * Dry-run: DRY_RUN=1 node scripts/backfill-deal-barcodes-approved.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const DRY = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

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
loadEnv(resolve(root, ".env"));

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
if (!url || !key) {
  console.error("Need SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY) in .env");
  process.exit(1);
}
const sb = createClient(url, key);

const measurePath = resolve(root, "_tmp_deal_barcode_map.json");
if (!existsSync(measurePath)) {
  console.error("Missing", measurePath, "— run measure-deal-barcode-map.mjs first");
  process.exit(1);
}

/** Odbijeno ručnim reviewom (#2 Maasdam, #39 Kinder Pingui cocco) */
const REJECT_STRIPPED = new Set([
  "Sir Maasdam",
  "Kinder Pingui cocco 30 g",
]);

const measure = JSON.parse(readFileSync(measurePath, "utf8"));
const approved = (measure.allUnique || []).filter(
  (u) => !REJECT_STRIPPED.has(u.dealStripped)
);

if (approved.length !== 40) {
  console.error(
    `Expected exactly 40 approved, got ${approved.length} (unique was ${measure.allUnique?.length}). Abort.`
  );
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      dryRun: DRY,
      approved: approved.length,
      rejected: [...REJECT_STRIPPED],
    },
    null,
    2
  )
);

const results = [];
let updated = 0;
let skippedHasBarcode = 0;
let missingDeal = 0;
let errors = 0;

for (const u of approved) {
  const { data: deals, error: dErr } = await sb
    .from("active_deals")
    .select("deal_id, product_id, name, barcode, store_name, price")
    .eq("deal_id", u.dealId)
    .limit(1);

  if (dErr) {
    errors++;
    results.push({ ...u, status: "error", error: dErr.message });
    continue;
  }
  const deal = deals?.[0];
  if (!deal?.product_id) {
    missingDeal++;
    results.push({ ...u, status: "missing_deal" });
    continue;
  }

  const existing = String(deal.barcode || "").trim();
  if (existing) {
    skippedHasBarcode++;
    results.push({
      ...u,
      productId: deal.product_id,
      status: existing === u.catalogBarcode ? "already_same" : "already_other",
      existingBarcode: existing,
    });
    continue;
  }

  if (DRY) {
    updated++;
    results.push({
      ...u,
      productId: deal.product_id,
      status: "would_update",
    });
    continue;
  }

  const { error: uErr } = await sb
    .from("products")
    .update({ barcode: u.catalogBarcode })
    .eq("id", deal.product_id)
    .is("barcode", null);

  if (uErr) {
    errors++;
    results.push({
      ...u,
      productId: deal.product_id,
      status: "update_error",
      error: uErr.message,
    });
    continue;
  }

  // Verify via view
  const { data: check } = await sb
    .from("active_deals")
    .select("barcode")
    .eq("deal_id", u.dealId)
    .limit(1);

  const got = String(check?.[0]?.barcode || "").trim();
  if (got !== u.catalogBarcode) {
    errors++;
    results.push({
      ...u,
      productId: deal.product_id,
      status: "verify_fail",
      got,
    });
    continue;
  }

  updated++;
  results.push({
    ...u,
    productId: deal.product_id,
    status: "updated",
  });
}

const summary = {
  dryRun: DRY,
  approved: approved.length,
  updated,
  skippedHasBarcode,
  missingDeal,
  errors,
};

console.log("\n=== SUMMARY ===");
console.log(JSON.stringify(summary, null, 2));

const outPath = resolve(root, "_tmp_deal_barcode_backfill.json");
writeFileSync(outPath, JSON.stringify({ summary, results }, null, 2), "utf8");
console.log("Wrote", outPath);

// Spot-check the two demo products
for (const needle of [
  "Toblerone Čokolada 100 g",
  "Podravka Pekmez od šljiva 660 g",
]) {
  const row = results.find((r) => r.dealStripped === needle);
  console.log("spot", needle, row?.status, row?.catalogBarcode || row?.error);
}
