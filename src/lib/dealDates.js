/** Kalendar u HR vremenskoj zoni (Europe/Zagreb; DST se poštuje). */
const TZ = "Europe/Zagreb";

/** Novo: broj kalendarskih dana unatrag uključujući danas (3 = danas + 2). */
export const NOVO_WINDOW_DAYS = 3;

export function calendarDayKey(dateInput) {
  if (!dateInput) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(dateInput));
}

/**
 * Pomakni YYYY-MM-DD za n kalendarskih dana (UTC noon sidro — bez ms/DST drift).
 * @param {string} ymd
 * @param {number} n
 */
export function shiftCalendarDayKey(ymd, n) {
  const [y, m, d] = String(ymd).split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function todayKey(now = new Date()) {
  return calendarDayKey(now);
}

/**
 * Novo: isključivo product.productCreatedAt.
 * Prozor NOVO_WINDOW_DAYS kalendarskih dana u Europe/Zagreb (danas + N-1 unatrag).
 * null → false. Bez fallbacka na createdAt.
 * @param {{ productCreatedAt?: string | null, createdAt?: string | null }} product
 * @param {Date} [now]
 */
export function isNewProduct(product, now = new Date()) {
  const raw = product?.productCreatedAt;
  if (raw == null || raw === "") return false;
  const key = calendarDayKey(raw);
  if (!key) return false;
  const today = todayKey(now);
  if (!today) return false;
  for (let i = 0; i < NOVO_WINDOW_DAYS; i++) {
    if (key === shiftCalendarDayKey(today, -i)) return true;
  }
  return false;
}

/** Danas ističe: valid_until pada na današnji dan u Europe/Zagreb. */
export function isExpiringTodayProduct(product) {
  const ref = product?.validUntil ?? product?.valid_until;
  if (!ref) return false;
  return calendarDayKey(ref) === todayKey();
}
