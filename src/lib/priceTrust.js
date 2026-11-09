/** Zajednički tekstovi za povjerenje u cijene (besplatno, samo UI). */

export const PRICE_DISCLAIMER =
  "Cijene iz baze — provjeri na polici prije kupnje.";

/** Chip „Danas ističe“ na Home — UI only; filter logika ostaje. */
export const SHOW_EXPIRING_CHIP = false;

/** „Ističe za Nd“ / „Još Nd“ / „Akcija do …“ — UI only; adapters i datumi ostaju. */
export const SHOW_EXPIRES_IN = false;

/** Redovna cijena starija od ovoga → diskretno upozorenje (bez crvenog alarma). */
export const REGULAR_PRICE_STALE_DAYS = 14;

export function formatPriceDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("hr-HR", { day: "numeric", month: "short", year: "numeric" });
}

/** HR datum bez godine: „8.11.” */
export function formatPriceDateDayMonth(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getDate()}.${d.getMonth() + 1}.`;
}

function isOlderThanDays(iso, days) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return Date.now() - d.getTime() > days * 24 * 60 * 60 * 1000;
}

/** Jedna linija datuma za proizvod/akciju — null ako nema podatka. */
export function productDateLabel(p) {
  if (!p) return null;
  if (p.priceSource === "regular") {
    const dayMonth = formatPriceDateDayMonth(p.scrapedAt);
    if (!dayMonth) return null;
    let label = `Cijena iz cjenika od ${dayMonth}`;
    if (isOlderThanDays(p.scrapedAt, REGULAR_PRICE_STALE_DAYS)) {
      label += " · možda nije aktualna";
    }
    return label;
  }
  if (SHOW_EXPIRES_IN) {
    const until = formatPriceDate(p.validUntil);
    if (until) return `Akcija do ${until}`;
    if (p.expiresIn) return `Još ${p.expiresIn}`;
  }
  const scraped = formatPriceDate(p.scrapedAt);
  if (scraped) return `Ažurirano ${scraped}`;
  return null;
}
