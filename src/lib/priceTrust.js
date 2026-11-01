/** Zajednički tekstovi za povjerenje u cijene (besplatno, samo UI). */

export const PRICE_DISCLAIMER =
  "Cijene iz baze — provjeri na polici prije kupnje.";

/** Chip „Danas ističe“ na Home — UI only; filter logika ostaje. */
export const SHOW_EXPIRING_CHIP = false;

/** „Ističe za Nd“ / „Još Nd“ — UI only; adapters i datumi ostaju. */
export const SHOW_EXPIRES_IN = false;

export function formatPriceDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("hr-HR", { day: "numeric", month: "short", year: "numeric" });
}

/** Jedna linija datuma za proizvod/akciju — null ako nema podatka. */
export function productDateLabel(p) {
  if (!p) return null;
  const until = formatPriceDate(p.validUntil);
  if (until) return `Akcija do ${until}`;
  if (SHOW_EXPIRES_IN && p.expiresIn) return `Još ${p.expiresIn}`;
  const scraped = formatPriceDate(p.scrapedAt);
  if (scraped) return `Ažurirano ${scraped}`;
  return null;
}
