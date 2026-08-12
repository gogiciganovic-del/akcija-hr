/**
 * Relevantnost pretrage: granica riječi + hrvatski nastavci, bez full-text indeksa.
 */

const STOP_BEFORE = new Set([
  "OD",
  "SA",
  "S",
  "U",
  "I",
  "ZA",
  "NA",
  "PO",
  "IZ",
  "DO",
  "BEZ",
  "IL",
]);

/** Maks. duljina deklinacijskog nastavka (kruh → kruha, kruhom). */
const MAX_SUFFIX_LEN = 4;

export const RELEVANCE = {
  NAME_STARTS: 0,
  NAME_WORD: 1,
  NAME_WORD_AFTER_OTHER: 2,
  BRAND_ONLY: 3,
  SUBSTRING_ONLY: 4,
  NONE: 5,
};

function normalize(text) {
  return String(text || "")
    .toUpperCase()
    .normalize("NFC");
}

/** @param {string} token @param {string} term */
export function tokenMatchesTerm(token, term) {
  const t = normalize(term);
  const tok = normalize(token);
  if (!t || !tok) return false;
  if (tok === t) return true;
  if (tok.startsWith(t)) {
    const extra = tok.length - t.length;
    return extra > 0 && extra <= MAX_SUFFIX_LEN;
  }
  return false;
}

/** @param {string} name */
export function tokenizeSearchName(name) {
  return normalize(name)
    .split(/[^A-ZČĆŽŠĐ0-9]+/u)
    .filter(Boolean);
}

/**
 * @param {string} name
 * @param {string | null | undefined} brand
 * @param {string} query
 * @returns {number} RELEVANCE.* (manje = bolje)
 */
export function scoreSearchRelevance(name, brand, query) {
  const q = String(query || "").trim();
  if (!q) return RELEVANCE.NONE;

  const tokens = tokenizeSearchName(name);
  const matchIdx = tokens.findIndex((tok) => tokenMatchesTerm(tok, q));

  if (matchIdx >= 0) {
    if (matchIdx === 0) return RELEVANCE.NAME_STARTS;
    const before = tokens.slice(0, matchIdx).filter((t) => !STOP_BEFORE.has(t));
    if (before.length === 0) return RELEVANCE.NAME_WORD;
    if (before.length === 1 && before[0].length <= 10) return RELEVANCE.NAME_WORD;
    return RELEVANCE.NAME_WORD_AFTER_OTHER;
  }

  const brandTokens = tokenizeSearchName(brand);
  const brandWordHit = brandTokens.some((tok) => tokenMatchesTerm(tok, q));
  const normBrand = normalize(brand);
  const normQ = normalize(q);
  const brandSub = normBrand && normBrand.includes(normQ);

  if (brandWordHit || brandSub) return RELEVANCE.BRAND_ONLY;

  const normName = normalize(name);
  if (normName.includes(normQ)) return RELEVANCE.SUBSTRING_ONLY;

  return RELEVANCE.NONE;
}

/**
 * Sort: relevantnost → cijena uzlazno (akcija/redovna ne dira redoslijed —
 * badge i dalje pokazuje izvor; za usporedbu cijena jeftinije ide prvo).
 * @template T
 * @param {T[]} list
 * @param {string} query
 * @param {(item: T) => { name: string, brand?: string|null, salePrice?: number, price?: number, priceSource?: string }} [pick]
 */
export function sortBySearchRelevance(list, query, pick) {
  const get = pick || ((p) => p);
  return list
    .map((raw, index) => {
      const p = get(raw);
      const price = Number(p.salePrice ?? p.price);
      return {
        raw,
        index,
        score: scoreSearchRelevance(p.name, p.brand, query),
        price: Number.isFinite(price) ? price : Infinity,
      };
    })
    .sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      if (a.price !== b.price) return a.price - b.price;
      return a.index - b.index;
    })
    .map((x) => x.raw);
}
