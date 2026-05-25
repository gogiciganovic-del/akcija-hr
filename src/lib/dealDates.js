/** Kalendar u HR vremenskoj zoni — usklađeno s valid_until u bazi. */
const TZ = "Europe/Zagreb";

export function calendarDayKey(dateInput) {
  if (!dateInput) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(dateInput));
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** Novo: akcija scrapeana u zadnjih 7 dana (scraped_at, inače valid_from / created_at). */
export function isNewProduct(product) {
  const ref = product.scrapedAt ?? product.validFrom ?? product.createdAt;
  if (!ref) return false;
  return Date.now() - new Date(ref).getTime() <= SEVEN_DAYS_MS;
}

/** Danas ističe: valid_until pada na današnji dan (HR). */
export function isExpiringToday(validUntil) {
  if (!validUntil) return false;
  return calendarDayKey(validUntil) === calendarDayKey(new Date());
}
