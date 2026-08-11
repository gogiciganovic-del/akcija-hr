/**
 * Parsiranje količine iz naziva proizvoda.
 * Podržava: "0,75 L", "625ml", "cca 850g", "6x1.5L", "6 x 1,5 l", "4x80 g",
 * te komadne: "16 rola", "10 kom", "100 maramica", "10/1", "x10".
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

const UNIT_ALT = "kg|g|gr|grama|gram|ml|mililitara|mililitar|l|lit|litara|litra|litre";

/** Riječi koje znače broj komada (ne težinu/volumen). */
const PIECE_WORD_ALT =
  "rola|role|kom|komad|komada|maramica|maramice|vrećica|vrećice|vrecica|vrecice|kapsula|kapsule|tableta|tablete";

/**
 * @typedef {{ value: number, unit: 'g'|'kg'|'ml'|'L'|'kom', unitValue?: number }} ParsedQuantity
 */

/**
 * Multipack: "6x1.5L", "6 x 1,5 l", "4×80 g" → ukupna količina.
 * unitValue = veličina jednog komada (za usporedbu pakiranja).
 * @param {string} s
 * @returns {ParsedQuantity | null}
 */
function parseMultipack(s) {
  const re = new RegExp(
    `(\\d+)\\s*[x×*]\\s*(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_ALT})\\b`,
    "gi"
  );
  let best = null;
  let m;
  while ((m = re.exec(s)) !== null) {
    const count = parseInt(m[1], 10);
    const unitVal = parseFloat(m[2].replace(",", "."));
    const unit = UNIT_MAP[m[3].toLowerCase()];
    if (!Number.isFinite(count) || count <= 0) continue;
    if (!Number.isFinite(unitVal) || unitVal <= 0 || !unit) continue;
    best = { value: count * unitVal, unit, unitValue: unitVal };
  }
  return best;
}

/**
 * Komadne jedinice — samo kad uz broj nema g/kg/ml/L.
 * @param {string} s
 * @returns {ParsedQuantity | null}
 */
function parsePieceCount(s) {
  let best = null;

  // 16 rola, 10 kom, 6 komada, 100 maramica, 50 vrećica, 20 kapsula
  const wordRe = new RegExp(`(\\d+)\\s*(${PIECE_WORD_ALT})\\b`, "gi");
  let m;
  while ((m = wordRe.exec(s)) !== null) {
    const value = parseInt(m[1], 10);
    if (!Number.isFinite(value) || value <= 0) continue;
    best = { value, unit: "kom" };
  }

  // 10/1 (pakiranje od N komada)
  const slashRe = /\b(\d+)\s*\/\s*1\b/gi;
  while ((m = slashRe.exec(s)) !== null) {
    const value = parseInt(m[1], 10);
    if (!Number.isFinite(value) || value <= 0) continue;
    best = { value, unit: "kom" };
  }

  // x10 / ×10 — ne „231 x 150 cm“ ni „40x40“ (dimenzije / NxM)
  const xRe =
    /(?:^|[^0-9\s])\s*[x×]\s*(\d+)\b(?!\s*(?:kg|g|gr|grama|gram|ml|mililitara|mililitar|l|lit|litara|litra|litre|cm|mm|m)\b)/gi;
  while ((m = xRe.exec(s)) !== null) {
    const value = parseInt(m[1], 10);
    if (!Number.isFinite(value) || value <= 0) continue;
    best = { value, unit: "kom" };
  }

  return best;
}

/**
 * @param {string | null | undefined} name
 * @returns {ParsedQuantity | null}
 */
export function parseQuantityFromName(name) {
  const s = String(name || "");
  if (!s.trim()) return null;

  // Multipack težina/volumen ima prednost (ukupna količina)
  const multi = parseMultipack(s);
  if (multi) return multi;

  // Jedna količina: cca / ca / approx optional
  const re = new RegExp(
    `(?:\\bcca|\\bca|\\bapprox\\.?)?\\s*(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_ALT})\\b`,
    "gi"
  );

  let best = null;
  let m;
  while ((m = re.exec(s)) !== null) {
    const rawNum = m[1].replace(",", ".");
    const value = parseFloat(rawNum);
    if (!Number.isFinite(value) || value <= 0) continue;
    const unit = UNIT_MAP[m[2].toLowerCase()];
    if (!unit) continue;
    best = { value, unit };
  }
  if (best) return best;

  // Komadno samo ako nema g/kg/ml/L
  return parsePieceCount(s);
}

/**
 * Cijena po kg, L ili kom. null ako se ne može izračunati.
 * @param {number | null | undefined} price
 * @param {number | null | undefined} quantityValue
 * @param {string | null | undefined} quantityUnit
 * @returns {{ perUnit: number, unitLabel: 'kg'|'L'|'kom' } | null}
 */
export function pricePerBaseUnit(price, quantityValue, quantityUnit) {
  const p = Number(price);
  const q = Number(quantityValue);
  if (!Number.isFinite(p) || p <= 0 || !Number.isFinite(q) || q <= 0) return null;
  const u = String(quantityUnit || "");

  if (u === "kg") return { perUnit: p / q, unitLabel: "kg" };
  if (u === "g") return { perUnit: p / (q / 1000), unitLabel: "kg" };
  if (u === "L") return { perUnit: p / q, unitLabel: "L" };
  if (u === "ml") return { perUnit: p / (q / 1000), unitLabel: "L" };
  if (u === "kom") return { perUnit: p / q, unitLabel: "kom" };
  return null;
}

/**
 * Format npr. "2,45 €/kg" ili "0,22 €/kom"
 * @param {number} perUnit
 * @param {'kg'|'L'|'kom'} unitLabel
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
