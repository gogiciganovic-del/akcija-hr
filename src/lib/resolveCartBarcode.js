import { supabase } from "./supabase";

/**
 * Jedinstveni barkod iz regular_prices za lanac + točan naziv.
 * Ista stroga pravila kao 009: točno 1 različiti barcode, inače null.
 * Ne dira cartCompare / soft match.
 */
export async function resolveUniqueBarcode(name, chain) {
  const n = String(name || "").trim();
  const c = String(chain || "").trim();
  if (!n || !c || n.length < 3) return null;

  const nameKey = n.toLowerCase();

  try {
    const { data, error } = await supabase
      .from("regular_prices")
      .select("barcode, name")
      .eq("chain", c)
      .ilike("name", n.replace(/[%_]/g, ""))
      .limit(20);

    if (error) return null;

    const codes = new Set();
    for (const row of data || []) {
      if (String(row.name || "").trim().toLowerCase() !== nameKey) continue;
      const code = String(row.barcode || "").trim();
      if (code.length < 8) continue;
      codes.add(code);
      if (codes.size > 1) return null;
    }

    if (codes.size !== 1) return null;
    return [...codes][0];
  } catch {
    return null;
  }
}

/**
 * Dopuni barkod na stavkama kojima nedostaje.
 * Ne mijenja cijene ni imena — samo barcode polje.
 */
export async function enrichItemsWithBarcodes(items, chain) {
  if (!chain || !items?.length) return items || [];

  return Promise.all(
    items.map(async (item) => {
      if (item?.barcode) return item;
      if (!item?.name) return item;
      const barcode = await resolveUniqueBarcode(item.name, chain);
      return barcode ? { ...item, barcode } : item;
    })
  );
}
