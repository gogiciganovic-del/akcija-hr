/**
 * CTA „Obavijesti me kad padne redovna cijena” — čista logika (bez React / push API).
 */

import { isTrackableBarcode } from "./pushTrackedBarcodes.js";

export const TRACK_REGULAR_LABEL_IDLE =
  "Obavijesti me kad padne redovna cijena";
export const TRACK_REGULAR_LABEL_TRACKING = "Pratim redovnu cijenu";
export const TRACK_REGULAR_NOTE = "Pratimo redovnu cijenu, ne letak.";
export const TRACK_REGULAR_CONFIRM = "Pratimo redovnu cijenu";
export const TRACK_REGULAR_DENIED =
  "Obavijesti su blokirane u pregledniku. Uključi ih u postavkama pa pokušaj ponovno.";
export const TRACK_REGULAR_ENABLE_FALLBACK =
  "Obavijesti nisu uključene. Možeš ih uključiti kasnije u Favoritima.";

/** Gumb vidljiv samo uz barkod duljine ≥ 8. */
export function showTrackRegularPriceCta(product) {
  return isTrackableBarcode(product?.barcode);
}

/**
 * Barkod je u favoritima (još ne znači da je push uključen).
 * @param {{ barcode?: string|null }} product
 * @param {(code: string) => boolean} [isBarcodeFavorite]
 */
export function isBarcodeInFavorites(product, isBarcodeFavorite) {
  if (!showTrackRegularPriceCta(product)) return false;
  const code = String(product.barcode || "").trim();
  if (typeof isBarcodeFavorite === "function") {
    return Boolean(isBarcodeFavorite(code));
  }
  return false;
}

/**
 * „Pratim redovnu cijenu” samo kad je barkod u favoritima I push subscribed.
 * @param {{ barcode?: string|null }} product
 * @param {(code: string) => boolean} [isBarcodeFavorite]
 * @param {string} [pushStatus]
 */
export function isTrackingRegularPrice(product, isBarcodeFavorite, pushStatus) {
  return (
    isBarcodeInFavorites(product, isBarcodeFavorite) &&
    pushStatus === "subscribed"
  );
}

/**
 * @param {boolean} tracking
 * @returns {string}
 */
export function trackRegularPriceButtonLabel(tracking) {
  return tracking ? TRACK_REGULAR_LABEL_TRACKING : TRACK_REGULAR_LABEL_IDLE;
}

/**
 * Poruka za failed enable. "busy" → null (ne prikazuj).
 * @param {unknown} error
 * @returns {string|null}
 */
export function trackEnableErrorMessage(error) {
  const msg =
    error && typeof error === "object" && error.message != null
      ? String(error.message)
      : "";
  if (msg === "busy") return null;
  if (!msg) return TRACK_REGULAR_ENABLE_FALLBACK;
  return msg;
}
