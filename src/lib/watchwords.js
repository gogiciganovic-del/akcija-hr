/**
 * Lokalno praćenje ključnih riječi („Za tebe”) — bez pusha / migracije.
 * Match: fold dijakritika + word-boundary (slično searchRelevance).
 */

export const WATCHWORDS_KEY = "cjenko_watchwords";
export const WATCHWORDS_MAX = 10;
export const WATCHWORDS_MIN_LEN = 3;
export const WATCHWORDS_MAX_LEN = 40;
export const WATCHWORDS_MAX_OFFERS = 6;

function resolveStorage(storage) {
  if (storage) return storage;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Lowercase + ukloni dijakritiku (č→c, š→s, đ→d, …). */
export function foldWatchText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // đ/Đ ne rastavljaju NFD-om — mapiraj ručno (kao dailyPicks)
    .replace(/đ/g, "d");
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Word-boundary regex na folded tekstu (bez lookbehinda — Safari-safe).
 * Oblik: (^|[^a-z0-9])<needle>($|[^a-z0-9])
 */
export function watchwordBoundaryRe(needleFolded) {
  const needle = String(needleFolded || "");
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(needle)}($|[^a-z0-9])`);
}

/**
 * Word-boundary match na folded tekstu (ASCII alnum granice).
 * Napomena: „piletina” i dalje može pogoditi hranu za pse — poznati false positive.
 */
export function nameMatchesWatchword(name, keyword) {
  const hay = foldWatchText(name);
  const needle = foldWatchText(keyword).trim();
  if (needle.length < WATCHWORDS_MIN_LEN) return false;
  return watchwordBoundaryRe(needle).test(hay);
}

/** Trim, collapse spaces; null ako ne valja duljina. */
export function normalizeWatchwordInput(raw) {
  const t = String(raw || "")
    .trim()
    .replace(/\s+/g, " ");
  if (t.length < WATCHWORDS_MIN_LEN || t.length > WATCHWORDS_MAX_LEN) return null;
  return t;
}

export function readWatchwords(storage) {
  const store = resolveStorage(storage);
  if (!store) return [];
  try {
    const raw = store.getItem(WATCHWORDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out = [];
    const seen = new Set();
    for (const item of parsed) {
      const w = normalizeWatchwordInput(item);
      if (!w) continue;
      const f = foldWatchText(w);
      if (seen.has(f)) continue;
      seen.add(f);
      out.push(w);
      if (out.length >= WATCHWORDS_MAX) break;
    }
    return out;
  } catch {
    return [];
  }
}

export function writeWatchwords(words, storage) {
  const store = resolveStorage(storage);
  if (!store) return false;
  try {
    const clean = [];
    const seen = new Set();
    for (const item of words || []) {
      const w = normalizeWatchwordInput(item);
      if (!w) continue;
      const f = foldWatchText(w);
      if (seen.has(f)) continue;
      seen.add(f);
      clean.push(w);
      if (clean.length >= WATCHWORDS_MAX) break;
    }
    store.setItem(WATCHWORDS_KEY, JSON.stringify(clean));
    return true;
  } catch {
    return false;
  }
}

/**
 * @returns {{ ok: boolean, words: string[], reason?: string }}
 */
export function addWatchword(words, raw) {
  const list = Array.isArray(words) ? [...words] : [];
  const w = normalizeWatchwordInput(raw);
  if (!w) return { ok: false, words: list, reason: "invalid" };
  const f = foldWatchText(w);
  if (list.some((x) => foldWatchText(x) === f)) {
    return { ok: false, words: list, reason: "duplicate" };
  }
  if (list.length >= WATCHWORDS_MAX) {
    return { ok: false, words: list, reason: "cap" };
  }
  const next = [...list, w];
  return { ok: true, words: next };
}

/**
 * @returns {{ ok: boolean, words: string[] }}
 */
export function removeWatchword(words, raw) {
  const list = Array.isArray(words) ? [...words] : [];
  const f = foldWatchText(normalizeWatchwordInput(raw) || String(raw || "").trim());
  if (!f) return { ok: false, words: list };
  const next = list.filter((x) => foldWatchText(x) !== f);
  return { ok: next.length !== list.length, words: next };
}

/**
 * Grupiraj aktivne ponude po ključnim riječima (max N po riječi).
 * Regex jednom po riječi; fold naziva jednom po proizvodu.
 * @param {Array<{ id?: string, name?: string }>} products
 * @param {string[]} words
 * @param {number} [maxPerWord]
 */
export function groupOffersByWatchwords(
  products,
  words,
  maxPerWord = WATCHWORDS_MAX_OFFERS
) {
  const list = Array.isArray(products) ? products : [];
  const keys = Array.isArray(words) ? words : [];

  const folded = list.map((p) => ({
    p,
    hay: foldWatchText(p?.name),
    id: p?.id != null ? String(p.id) : "",
  }));

  return keys.map((word) => {
    const offers = [];
    const seen = new Set();
    const needle = foldWatchText(word).trim();
    if (needle.length < WATCHWORDS_MIN_LEN) return { word, offers };
    const re = watchwordBoundaryRe(needle);
    for (const { p, hay, id } of folded) {
      if (!re.test(hay)) continue;
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      offers.push(p);
      if (offers.length >= maxPerWord) break;
    }
    return { word, offers };
  });
}

export function countWatchwordHits(groups) {
  if (!Array.isArray(groups)) return 0;
  return groups.reduce((n, g) => n + (g?.offers?.length || 0), 0);
}
