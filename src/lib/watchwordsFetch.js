/**
 * Dohvat ponuda za „Za tebe” — active_deals po riječi (isti ilike obrazac kao useProducts search).
 * Klijent zatim primjenjuje word-boundary (nameMatchesWatchword) i cap 6.
 *
 * supabase/adaptDeal se učitavaju lazy u stvarnom fetchu da Node testovi
 * (mock fetchFn) ne vuku Vite-only module graph.
 *
 * Napomena: adaptDeal trenutno ne mapira brand — fetch ga dodaje kao `brand`
 * (isto ime kao u active_deals / deal.brand).
 */

import {
  WATCHWORDS_MAX,
  WATCHWORDS_MAX_OFFERS,
  WATCHWORDS_MIN_LEN,
  foldWatchText,
  nameMatchesWatchword,
} from "./watchwords.js";

/** Koliko kandidata dohvatiti po riječi (ilike), prije word-boundary filtera. */
export const WATCHWORDS_FETCH_LIMIT = 40;
/** Limit kad se dijakritika proširuje (c/s/z/d → _). */
export const WATCHWORDS_FETCH_LIMIT_WIDENED = 80;
export const WATCHWORDS_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Isto kao useProducts.escapeIlike + dodatno ( ) * " \ .
 * Uklanja i _ / % da wildcardi ne dođu iz korisničkog unosa.
 */
export function escapeIlike(s) {
  return String(s || "").replace(/[%_,()"\\*]/g, "");
}

/**
 * Sastavi ilike needle + limit.
 * Bez dijakritike u riječi: c/s/z/d → "_" (ILIKE jedan znak), limit 80.
 * S dijakritikom: needle ostaje (escape), limit 40.
 * @returns {{ needle: string, limit: number, widened: boolean } | null}
 */
export function buildWatchwordIlikeQuery(raw) {
  const trimmed = String(raw || "").trim();
  const needleBase = escapeIlike(trimmed);
  if (needleBase.length < WATCHWORDS_MIN_LEN) return null;

  const hasDiacritic = /[čćšžđ]/i.test(trimmed);
  if (hasDiacritic) {
    return {
      needle: needleBase,
      limit: WATCHWORDS_FETCH_LIMIT,
      widened: false,
    };
  }

  const needle = needleBase.replace(/[cszd]/gi, "_");
  return {
    needle,
    limit: WATCHWORDS_FETCH_LIMIT_WIDENED,
    widened: needle !== needleBase,
  };
}

/** @type {Map<string, { at: number, offers: any[], error: string|null }>} */
const cache = new Map();

export function clearWatchwordsFetchCache() {
  cache.clear();
}

export function watchwordsCacheKey(word) {
  return foldWatchText(word).trim();
}

/** Haystack za word-boundary: name + brand (ako postoji). */
export function watchwordMatchHaystack(product) {
  const name = product?.name != null ? String(product.name) : "";
  const brand = product?.brand != null ? String(product.brand) : "";
  if (name && brand) return `${name} ${brand}`;
  return name || brand;
}

/**
 * Filtriraj ilike-kandidate word-boundaryjem (name + brand); max N; dedupe po id.
 * @param {Array<{ id?: string, name?: string, brand?: string }>} candidates
 * @param {string} word
 * @param {number} [max]
 */
export function pickOffersForWatchword(
  candidates,
  word,
  max = WATCHWORDS_MAX_OFFERS
) {
  const offers = [];
  const seen = new Set();
  for (const p of candidates || []) {
    if (!nameMatchesWatchword(watchwordMatchHaystack(p), word)) continue;
    const id = p?.id != null ? String(p.id) : "";
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    offers.push(p);
    if (offers.length >= max) break;
  }
  return offers;
}

/**
 * Upit kao useProducts search path: active_deals name/brand ilike, sort discount_pct desc.
 * @param {string} word
 * @param {{ client?: any, limit?: number }} [opts]
 */
export async function fetchActiveDealsForWatchword(word, opts = {}) {
  const qinfo = buildWatchwordIlikeQuery(word);
  if (!qinfo) return [];
  const { needle, limit: widenLimit } = qinfo;
  const limit = opts.limit ?? widenLimit;

  let db = opts.client;
  let adapt = opts.adaptDeal;
  if (!db || !adapt) {
    const [{ supabase }, { adaptDeal }] = await Promise.all([
      import("./supabase.js"),
      import("./adapters.js"),
    ]);
    db = db || supabase;
    adapt = adapt || adaptDeal;
  }

  let q = db.from("active_deals").select("*");
  q = q.or(`name.ilike.%${needle}%,brand.ilike.%${needle}%`);
  q = q.order("discount_pct", { ascending: false });
  q = q.limit(limit);
  const { data, error } = await q;
  if (error) throw error;
  // adaptDeal ne mapira brand — zadrži ga kao `brand` za pickOffers.
  return (data || []).map((row) => {
    const p = adapt(row);
    return { ...p, brand: row.brand ?? p.brand ?? null };
  });
}

/**
 * Jedna riječ: cache → fetch → pickOffers.
 * @returns {Promise<{ word: string, offers: any[], error: string|null, fromCache: boolean }>}
 */
export async function loadWatchwordGroup(word, opts = {}) {
  const key = watchwordsCacheKey(word);
  const now = opts.now ?? Date.now();
  const ttl = opts.ttlMs ?? WATCHWORDS_CACHE_TTL_MS;
  if (key) {
    const hit = cache.get(key);
    if (hit && now - hit.at < ttl) {
      return {
        word,
        offers: hit.offers,
        error: hit.error,
        fromCache: true,
      };
    }
  }

  const fetchFn = opts.fetchFn || fetchActiveDealsForWatchword;
  try {
    const candidates = await fetchFn(word, opts);
    const offers = pickOffersForWatchword(
      candidates,
      word,
      opts.maxOffers ?? WATCHWORDS_MAX_OFFERS
    );
    if (key) cache.set(key, { at: now, offers, error: null });
    return { word, offers, error: null, fromCache: false };
  } catch (err) {
    const message =
      err && typeof err === "object" && err.message
        ? String(err.message)
        : "fetch failed";
    // Ne cacheaj greške — sljedeći mount može uspjeti.
    return { word, offers: [], error: message, fromCache: false };
  }
}

/**
 * Paralelno po riječima (max WATCHWORDS_MAX).
 * @returns {Promise<{ groups: Array<{word:string,offers:any[],error:string|null}>, hitCount: number, allFailed: boolean }>}
 */
export async function loadWatchwordGroups(words, opts = {}) {
  const list = (Array.isArray(words) ? words : [])
    .map((w) => String(w || "").trim())
    .filter(Boolean)
    .slice(0, WATCHWORDS_MAX);
  if (!list.length) {
    return { groups: [], hitCount: 0, allFailed: false };
  }
  const results = await Promise.all(
    list.map((w) => loadWatchwordGroup(w, opts))
  );
  const groups = results.map(({ word, offers, error }) => ({
    word,
    offers,
    error,
  }));
  const hitCount = groups.reduce((n, g) => n + (g.offers?.length || 0), 0);
  const allFailed =
    groups.length > 0 && groups.every((g) => Boolean(g.error));
  return { groups, hitCount, allFailed };
}
