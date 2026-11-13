/** Tekst za dijeljenje košarice — čista funkcija, bez I/O. */

export const SHARE_CART_URL = "https://www.cjenko.app";

/** Ispod ovoga ušteda nije u share tekstu. */
const MIN_SAVINGS_SHARE = 0.1;

const fmtEur = (v) =>
  (v ?? 0).toLocaleString("hr-HR", { style: "currency", currency: "EUR" });

function countFound(lines) {
  if (!Array.isArray(lines)) return 0;
  return lines.filter((l) => l?.available && l.price != null).length;
}

/** Primary + others → redovi s found/total. */
function collectRows(results) {
  const itemCount = results?.itemCount || results?.primary?.lines?.length || 0;
  const rows = [];
  if (results?.primary) rows.push(results.primary);
  for (const o of results?.others || []) {
    if (o) rows.push(o);
  }
  return {
    itemCount,
    rows: rows.map((r) => ({
      label: String(r.label || r.chain || "").trim() || "?",
      total: r.total ?? 0,
      found: countFound(r.lines),
    })),
  };
}

/** True ako bar jedan lanac ima kompletnu košaricu. */
export function hasCompleteShareChain(results) {
  const { itemCount, rows } = collectRows(results);
  if (!(itemCount > 0)) return false;
  return rows.some((r) => r.found >= itemCount);
}

/**
 * HR popis: "A" | "A i B" | "A, B i C"
 * @param {string[]} labels
 */
export function joinHrLabels(labels) {
  const list = (labels || []).map((s) => String(s || "").trim()).filter(Boolean);
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} i ${list[1]}`;
  return `${list.slice(0, -1).join(", ")} i ${list[list.length - 1]}`;
}

/**
 * @param {object|null|undefined} results displayResults (primary + others + itemCount)
 * @param {{ isHoliday?: boolean, shareUrl?: string }} [opts]
 * @returns {string|null}
 */
export function buildShareCartText(results, opts = {}) {
  if (!results?.primary) return null;
  const isHoliday = opts.isHoliday === true;
  const shareUrl = String(opts.shareUrl || SHARE_CART_URL).trim() || SHARE_CART_URL;

  const { itemCount, rows } = collectRows(results);
  if (!(itemCount > 0) || rows.length === 0) return null;

  const title = isHoliday
    ? `Božićna košarica u Cjenku (${itemCount} artikala)`
    : `Moja košarica u Cjenku (${itemCount} artikala)`;

  const complete = rows
    .filter((r) => r.found >= itemCount)
    .sort((a, b) => (a.total ?? 0) - (b.total ?? 0))
    .slice(0, 3);

  let mid;
  if (complete.length > 0) {
    const list = complete.map((r) => `${r.label} ${fmtEur(r.total)}`).join(", ");
    mid = `${list}. Najjeftinije: ${complete[0].label}.`;
  } else {
    const partials = rows
      .filter((r) => r.found > 0)
      .sort((a, b) => b.found - a.found || (a.total ?? 0) - (b.total ?? 0));
    if (!partials.length) return null;
    const best = partials[0];
    mid = `${best.label} ${fmtEur(best.total)} (${best.found} od ${itemCount}).`;
  }

  const savings = results.primary?.savings ?? 0;
  const savingsPart =
    savings >= MIN_SAVINGS_SHARE ? ` Ušteda na akcijama: ${fmtEur(savings)}.` : "";

  return `${title}: ${mid}${savingsPart} ${shareUrl}`;
}
