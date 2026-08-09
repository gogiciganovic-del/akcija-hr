import { supabase } from "./supabase";
import { adaptDeal, adaptRegularPrice } from "./adapters";
import { chainFromStoreName } from "./constants";
import { productPlaceholderDataUri } from "./productImage";

async function findSaleExactForChain(name, chain) {
  const { data, error } = await supabase
    .from("active_deals")
    .select(
      "deal_id, product_id, name, store_name, price, original_price, discount_pct, image_url, category"
    )
    .eq("name", name)
    .order("price", { ascending: true })
    .limit(40);

  if (error) throw error;

  for (const row of data || []) {
    if (chainFromStoreName(row.store_name) !== chain) continue;
    const price = parseFloat(row.price);
    if (Number.isNaN(price)) continue;
    return row;
  }
  return null;
}

/** Lookup cijena po točnom barkodu: regular_prices → active_deals po nazivu+lancu. */
export async function lookupByBarcode(barcode) {
  const code = String(barcode || "").trim();
  if (!code) return [];

  const { data: regRows, error } = await supabase
    .from("regular_prices")
    .select("barcode, name, brand, chain, price, category, special_price")
    .eq("barcode", code)
    .order("price", { ascending: true });

  if (error) throw error;
  if (!regRows?.length) return [];

  const results = [];
  for (let i = 0; i < regRows.length; i++) {
    const row = regRows[i];
    const exactName = (row.name || "").trim();
    const saleRow = exactName ? await findSaleExactForChain(exactName, row.chain) : null;

    if (saleRow) {
      const adapted = adaptDeal(saleRow);
      results.push({
        ...adapted,
        id: `scan-sale-${row.chain}-${code}-${i}`,
        chain: row.chain,
        priceSource: "sale",
        image: adapted.image || productPlaceholderDataUri(adapted.name, 80),
      });
    } else {
      const adapted = adaptRegularPrice(row);
      results.push({
        ...adapted,
        id: `scan-regular-${row.chain}-${code}-${i}`,
        image: productPlaceholderDataUri(row.name, 80),
      });
    }
  }
  return results;
}
