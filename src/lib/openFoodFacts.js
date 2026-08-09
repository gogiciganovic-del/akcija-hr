/**
 * Open Food Facts — SAMO identifikacija (naziv, brand, slika).
 * Nikad ne koristi cijene iz OFF-a.
 */

const OFF_URL = "https://world.openfoodfacts.org/api/v2/product";
const TIMEOUT_MS = 3500;

/**
 * @param {string} barcode
 * @returns {Promise<{ name: string, brand: string|null, imageUrl: string|null } | null>}
 */
export async function fetchOpenFoodFactsProduct(barcode) {
  const code = String(barcode || "").trim();
  if (!code || code.length < 8) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${OFF_URL}/${encodeURIComponent(code)}.json`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;

    const data = await res.json();
    if (data?.status !== 1 || !data?.product) return null;

    const p = data.product;
    const name = String(
      p.product_name_hr ||
        p.product_name ||
        p.product_name_en ||
        p.generic_name_hr ||
        p.generic_name ||
        ""
    ).trim();
    if (!name) return null;

    const brand = String(p.brands || "")
      .split(",")[0]
      ?.trim() || null;

    const imageUrl =
      p.image_front_small_url ||
      p.image_small_url ||
      p.image_url ||
      null;

    return { name, brand, imageUrl };
  } catch {
    // timeout, network, abort — tihi fallback
    return null;
  } finally {
    clearTimeout(timer);
  }
}
