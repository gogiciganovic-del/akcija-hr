/**
 * „Najveći popusti ovaj tjedan” — klijentski izbor iz već učitanih akcija.
 * Bez novih upita / migracija.
 */
import { calendarDayKey } from "./dealDates.js";
import { chainFromStoreName } from "./constants.js";
import { hasRealPhoto } from "./dailyPicks.js";

export const TOP_DISCOUNT_MIN = 40;
export const TOP_DISCOUNT_MAX = 70;
export const TOP_DISCOUNT_MAX_ITEMS = 8;
export const TOP_DISCOUNT_MIN_ITEMS = 5;
export const BF_WINDOW_START = "2026-11-20";
export const BF_WINDOW_END = "2026-11-30";

function discountOf(product) {
  const d = Number(product?.discount ?? product?.discount_pct);
  return Number.isFinite(d) ? d : 0;
}

function chainKey(product) {
  const raw =
    product?.chain ||
    chainFromStoreName(product?.store) ||
    chainFromStoreName(product?.store_name) ||
    null;
  return raw ? String(raw) : null;
}

/** valid_until / validUntil strogo u budućnosti. Bez datuma → isteklo. */
export function isDealNotExpired(product, now = new Date()) {
  const raw = product?.validUntil ?? product?.valid_until;
  if (raw == null || raw === "") return false;
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return false;
  return t > now.getTime();
}

/**
 * Zagreb kalendarski dan u [2026-11-20, 2026-11-30].
 * @param {Date} [now]
 */
export function isTopDiscountWindowOpen(now = new Date()) {
  const key = calendarDayKey(now);
  if (!key) return false;
  return key >= BF_WINDOW_START && key <= BF_WINDOW_END;
}

/**
 * Prikaz trake: prozor datuma, ili DEV-only ?bf=1.
 * @param {Date} [now]
 * @param {{ search?: string, isDev?: boolean }} [opts]
 */
export function shouldShowTopDiscountStrip(now = new Date(), opts = {}) {
  const isDev = Boolean(opts.isDev);
  const search = opts.search ?? "";
  if (isDev) {
    try {
      const q = new URLSearchParams(
        String(search).startsWith("?") ? String(search).slice(1) : String(search)
      );
      if (q.get("bf") === "1") return true;
    } catch {
      // ignore
    }
  }
  return isTopDiscountWindowOpen(now);
}

/**
 * Najveći popusti: 40–70%, foto, nije istekla; 1 po lancu; max 8; inače [].
 * @param {Array<object>} products
 * @param {{ now?: Date, minDiscount?: number, maxDiscount?: number, maxItems?: number, minItems?: number }} [opts]
 * @returns {object[]}
 */
export function selectTopDiscounts(products, opts = {}) {
  const now = opts.now ?? new Date();
  const minD = opts.minDiscount ?? TOP_DISCOUNT_MIN;
  const maxD = opts.maxDiscount ?? TOP_DISCOUNT_MAX;
  const maxItems = opts.maxItems ?? TOP_DISCOUNT_MAX_ITEMS;
  const minItems = opts.minItems ?? TOP_DISCOUNT_MIN_ITEMS;
  const list = Array.isArray(products) ? products : [];

  const eligible = [];
  for (const p of list) {
    if (!p) continue;
    const d = discountOf(p);
    if (d < minD || d > maxD) continue;
    if (!hasRealPhoto(p)) continue;
    if (!isDealNotExpired(p, now)) continue;
    const chain = chainKey(p);
    if (!chain) continue;
    eligible.push({ p, d, chain });
  }

  eligible.sort((a, b) => {
    if (b.d !== a.d) return b.d - a.d;
    return String(a.p?.id ?? "").localeCompare(String(b.p?.id ?? ""));
  });

  const seen = new Set();
  const picked = [];
  for (const row of eligible) {
    if (seen.has(row.chain)) continue;
    seen.add(row.chain);
    picked.push(row.p);
    if (picked.length >= maxItems) break;
  }

  if (picked.length < minItems) return [];
  return picked;
}
