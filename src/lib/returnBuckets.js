/**
 * Retention bucketing po kalendarskim danima (Europe/Zagreb).
 *
 * Napomena: postojeći korisnici dobivaju cjenko_first_open tek kad ovo izađe,
 * pa će prvih tjedan dana (nakon deploya) gotovo svi biti "dan_0".
 *
 * Eventi: samo ime (povratak_dan_0 | …) — bez svojstava / PII.
 */
import { calendarDayKey } from "./dealDates.js";

export const FIRST_OPEN_KEY = "cjenko_first_open";

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** @param {string|null|undefined} ymd */
export function isValidDayKey(ymd) {
  const s = String(ymd || "").trim();
  const m = YMD_RE.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  // UTC noon sidro — isti pristup kao shiftCalendarDayKey (bez DST drifta).
  const dt = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === mo - 1 &&
    dt.getUTCDate() === d
  );
}

/**
 * Broj kalendarskih dana između dva YYYY-MM-DD (today − first).
 * @param {string} firstOpenKey
 * @param {string} todayKey
 * @returns {number|null}
 */
export function calendarDaysBetween(firstOpenKey, todayKey) {
  if (!isValidDayKey(firstOpenKey) || !isValidDayKey(todayKey)) return null;
  const [y1, m1, d1] = firstOpenKey.split("-").map(Number);
  const [y2, m2, d2] = todayKey.split("-").map(Number);
  const t1 = Date.UTC(y1, m1 - 1, d1, 12, 0, 0);
  const t2 = Date.UTC(y2, m2 - 1, d2, 12, 0, 0);
  const days = Math.round((t2 - t1) / 86400000);
  if (!Number.isFinite(days) || days < 0) return null;
  return days;
}

/**
 * @param {string|null|undefined} firstOpenKey
 * @param {string|null|undefined} todayKey
 * @returns {"dan_0"|"dan_1"|"dan_2_3"|"dan_4_7"|"dan_8_plus"|null}
 */
export function returnBucket(firstOpenKey, todayKey) {
  const days = calendarDaysBetween(firstOpenKey, todayKey);
  if (days == null) return null;
  if (days === 0) return "dan_0";
  if (days === 1) return "dan_1";
  if (days <= 3) return "dan_2_3";
  if (days <= 7) return "dan_4_7";
  return "dan_8_plus";
}

/**
 * Pročitaj spremljeni first_open; null ako nema / nevaljan / storage pada.
 * @param {{ getItem?: Function }|null|undefined} storage
 */
export function readFirstOpenKey(storage) {
  try {
    const raw = storage?.getItem?.(FIRST_OPEN_KEY);
    const key = String(raw || "").trim();
    return isValidDayKey(key) ? key : null;
  } catch {
    return null;
  }
}

/**
 * Upiši first_open samo ako ključ ne postoji. Ne dira postojeću vrijednost.
 * @param {{ getItem?: Function, setItem?: Function }|null|undefined} storage
 * @param {string} todayKey
 * @returns {string|null} trenutni (stari ili novi) key, ili null
 */
export function ensureFirstOpenKey(storage, todayKey) {
  if (!isValidDayKey(todayKey)) return null;
  try {
    if (!storage?.getItem || !storage?.setItem) return null;
    const existing = readFirstOpenKey(storage);
    if (existing) return existing;
    // Ako postoji nešto nevaljano — ne prepisuj (konzervativno).
    const raw = storage.getItem(FIRST_OPEN_KEY);
    if (raw != null && String(raw).trim() !== "") return null;
    storage.setItem(FIRST_OPEN_KEY, todayKey);
    return todayKey;
  } catch {
    return null;
  }
}

/**
 * Jednom po sesiji (in-memory state.seen), kao otvoreno_iz_appa.
 * @param {string|null|undefined} bucket
 * @param {{ seen: boolean }} [state]
 * @returns {boolean}
 */
export function consumePovratakBucket(bucket, state) {
  if (!state || state.seen) return false;
  if (!bucket) return false;
  state.seen = true;
  return true;
}

/**
 * Persist first_open + vrati event name "povratak_<bucket>" ili null.
 * Čisto oko datuma/storage; caller šalje track().
 * @param {{
 *   now?: Date,
 *   storage?: { getItem?: Function, setItem?: Function }|null,
 * }} [opts]
 * @returns {string|null}
 */
export function resolvePovratakEventName(opts = {}) {
  const now = opts.now ?? new Date();
  const todayKey = calendarDayKey(now);
  if (!todayKey) return null;
  const storage = opts.storage ?? null;
  const first = ensureFirstOpenKey(storage, todayKey);
  if (!first) return null;
  const bucket = returnBucket(first, todayKey);
  if (!bucket) return null;
  return `povratak_${bucket}`;
}
