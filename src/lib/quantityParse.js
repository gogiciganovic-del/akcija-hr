/**
 * Parsiranje količine iz naziva proizvoda.
 * Podržava: "0,75 L", "625ml", "cca 850g", "155 g", "1kg", "1,5 kg"
 */

const UNIT_MAP = {
  g: "g",
  gr: "g",
  grama: "g",
  gram: "g",
  kg: "kg",
  kila: "kg",
  ml: "ml",
  mililitara: "ml",
  mililitar: "ml",
  l: "L",
  lit: "L",
  litara: "L",
  litra: "L",
  litre: "L",
};

/**
 * @typedef {{ value: number, unit: 'g'|'kg'|'ml'|'L' }} ParsedQuantity
 */

/**
 * @param {string | null | undefined} name
 * @returns {ParsedQuantity | null}
 */
export function parseQuantityFromName(name) {
  const s = String(name || "");
  if (!s.trim()) return null;

  // cca / ca / approx optional, number with . or ,, optional space, unit
  const re =
    /(?:\bcca|\bca|\bapprox\.?)?\s*(\d+(?:[.,]\d+)?)\s*(kg|g|gr|grama|gram|ml|mililitara|mililitar|l|lit|litara|litra|litre)\b/gi;

  let best = null;
  let m;
  while ((m = re.exec(s)) !== null) {
    const rawNum = m[1].replace(",", ".");
    const value = parseFloat(rawNum);
    if (!Number.isFinite(value) || value <= 0) continue;
    const unitKey = m[2].toLowerCase();
    const unit = UNIT_MAP[unitKey];
    if (!unit) continue;
    // Prefer later match (often pack size at end) but keep first decent if none
    best = { value, unit };
  }
  return best;
}

/**
 * Cijena po kg ili L. null ako se ne može izračunati.
 * @param {number | null | undefined} price
 * @param {number | null | undefined} quantityValue
 * @param {string | null | undefined} quantityUnit
 * @returns {{ perUnit: number, unitLabel: 'kg'|'L' } | null}
 */
export function pricePerBaseUnit(price, quantityValue, quantityUnit) {
  const p = Number(price);
  const q = Number(quantityValue);
  if (!Number.isFinite(p) || p < 0 || !Number.isFinite(q) || q <= 0) return null;
  const u = String(quantityUnit || "");

  if (u === "kg") return { perUnit: p / q, unitLabel: "kg" };
  if (u === "g") return { perUnit: p / (q / 1000), unitLabel: "kg" };
  if (u === "L") return { perUnit: p / q, unitLabel: "L" };
  if (u === "ml") return { perUnit: p / (q / 1000), unitLabel: "L" };
  return null;
}

/**
 * Format npr. "2,45 €/kg"
 * @param {number} perUnit
 * @param {'kg'|'L'} unitLabel
 */
export function formatPricePerUnit(perUnit, unitLabel) {
  const n = Number(perUnit);
  if (!Number.isFinite(n)) return null;
  const money = n.toLocaleString("hr-HR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${money}/${unitLabel}`;
}
