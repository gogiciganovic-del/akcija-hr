/**
 * Čista logika tracked_barcodes (bez Supabase / browser API) — testabilno u Nodeu.
 */

/** Barkod dovoljno dug za praćenje pada cijene (EAN / slično). */
export function isTrackableBarcode(barcode) {
  return String(barcode || "").trim().length >= 8;
}

/** Favorit koji može ući u tracked_barcodes. */
export function favoriteHasTrackableBarcode(product) {
  return isTrackableBarcode(product?.barcode);
}

/**
 * @param {Map<string, { barcode?: string|null }> | Iterable<{ barcode?: string|null }>} favorites
 * @returns {string[]}
 */
export function barcodesFromFavorites(favorites) {
  const values =
    favorites instanceof Map
      ? [...favorites.values()]
      : favorites
        ? [...favorites]
        : [];
  const set = new Set();
  for (const p of values) {
    const bc = String(p?.barcode || "").trim();
    if (isTrackableBarcode(bc)) set.add(bc);
  }
  return [...set].slice(0, 500);
}

/**
 * Odluči što sync smije poslati na server.
 * Štiti od brisanja tracked_barcodes=[] na početnom loadu s praznim localStorage
 * (SW pretplata i dalje živa), a zadržava barkodove kad se doda favorit bez barkoda.
 *
 * @param {Map<string, any>} favorites
 * @param {{ isInitialLoad?: boolean, previousSynced?: string[] }} [opts]
 * @returns {{ barcodes: string[], apply: boolean, reason: string }}
 */
export function planTrackedBarcodesUpdate(favorites, opts = {}) {
  const isInitialLoad = Boolean(opts.isInitialLoad);
  const size = favorites instanceof Map ? favorites.size : 0;
  const barcodes = barcodesFromFavorites(favorites);
  const previous = Array.isArray(opts.previousSynced)
    ? opts.previousSynced.map((b) => String(b || "").trim()).filter(isTrackableBarcode)
    : [];

  if (barcodes.length > 0) {
    return { barcodes, apply: true, reason: "trackable-favorites" };
  }

  // Favoriti postoje, ali nijedan nema barkod → nema što pratiti.
  if (size > 0) {
    return { barcodes: [], apply: true, reason: "favorites-without-barcode" };
  }

  // Prazan Map na prvom syncu nakon loada + ranije smo imali barkodove → ne briši server.
  if (isInitialLoad && previous.length > 0) {
    return {
      barcodes: previous,
      apply: false,
      reason: "skip-empty-wipe-on-initial-load",
    };
  }

  return { barcodes: [], apply: true, reason: "favorites-cleared" };
}
