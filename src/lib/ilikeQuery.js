/**
 * Zajednički ILIKE uzorak za pretragu / watchwords:
 * escape posebnih znakova; bez dijakritike c/s/z/d → "_" (jedan znak).
 */

import { WATCHWORDS_MIN_LEN, foldWatchText } from "./watchwords.js";

/** Koliko kandidata dohvatiti (ilike), prije klijentskog filtera/sorta. */
export const ILIKE_FETCH_LIMIT = 40;
/** Limit kad se dijakritika proširuje (c/s/z/d → _), ili kad nema dijakritike. */
export const ILIKE_FETCH_LIMIT_WIDENED = 80;

/**
 * Uklanja % _ , ( ) * " \ da wildcardi / PostgREST or-syntax ne dođu iz unosa.
 */
export function escapeIlike(s) {
  return String(s || "").replace(/[%_,()"\\*]/g, "");
}

/**
 * Folded podniz (ne word-boundary): foldWatchText(text) sadrži foldWatchText(term).
 * Prazan term nakon escapeIlike → true (ne filtriraj).
 */
export function matchesFoldedTerm(text, term) {
  const trimmed = String(term || "").trim();
  if (!escapeIlike(trimmed)) return true;
  const needle = foldWatchText(trimmed).trim();
  if (!needle) return true;
  return foldWatchText(text).includes(needle);
}

/**
 * Sastavi ilike needle + limit.
 * Bez dijakritike u riječi: c/s/z/d → "_" (ILIKE jedan znak), limit widened.
 * S dijakritikom: needle ostaje (escape), limit normal.
 * @param {string} raw
 * @param {{ minLen?: number, limit?: number, limitWidened?: number }} [opts]
 * @returns {{ needle: string, limit: number, widened: boolean } | null}
 */
export function buildWatchwordIlikeQuery(raw, opts = {}) {
  const minLen = opts.minLen ?? WATCHWORDS_MIN_LEN;
  const limitNormal = opts.limit ?? ILIKE_FETCH_LIMIT;
  const limitWidened = opts.limitWidened ?? ILIKE_FETCH_LIMIT_WIDENED;

  const trimmed = String(raw || "").trim();
  const needleBase = escapeIlike(trimmed);
  if (needleBase.length < minLen) return null;

  const hasDiacritic = /[čćšžđ]/i.test(trimmed);
  if (hasDiacritic) {
    return {
      needle: needleBase,
      limit: limitNormal,
      widened: false,
    };
  }

  const needle = needleBase.replace(/[cszd]/gi, "_");
  return {
    needle,
    limit: limitWidened,
    widened: needle !== needleBase,
  };
}
