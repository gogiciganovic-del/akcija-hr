/** Kalendar u HR vremenskoj zoni (UTC+2, scraper ~06:00 UTC = 08:00 HR). */
const TZ = "Europe/Zagreb";

export function calendarDayKey(dateInput) {
  if (!dateInput) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(dateInput));
}

/** Novo: created_at pada na današnji dan u Europe/Zagreb. */
export function isNewProduct(product) {
  if (!product.createdAt) return false;
  return calendarDayKey(product.createdAt) === calendarDayKey(new Date());
}

/** Danas ističe: valid_until pada na današnji dan u Europe/Zagreb. */
export function isExpiringTodayProduct(product) {
  const ref = product?.validUntil ?? product?.valid_until;
  if (!ref) return false;
  return calendarDayKey(ref) === calendarDayKey(new Date());
}
