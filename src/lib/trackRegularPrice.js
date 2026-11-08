/**
 * CTA „Obavijesti me kad padne redovna cijena” — čista logika (bez React / push API).
 */

import { isTrackableBarcode } from "./pushTrackedBarcodes.js";

export const TRACK_REGULAR_LABEL_IDLE =
  "Obavijesti me kad padne redovna cijena";
export const TRACK_REGULAR_LABEL_TRACKING = "Pratim redovnu cijenu";
export const TRACK_REGULAR_NOTE = "Pratimo redovnu cijenu, ne letak.";
export const TRACK_REGULAR_CONFIRM = "Pratimo redovnu cijenu";

/** Gumb vidljiv samo uz barkod duljine ≥ 8. */
export function showTrackRegularPriceCta(product) {
  return isTrackableBarcode(product?.barcode);
}

/**
 * Već u praćenju ako favoriti sadrže isti barkod.
 * @param {{ barcode?: string|null }} product
 * @param {(code: string) => boolean} [isBarcodeFavorite]
 */
export function isTrackingRegularPrice(product, isBarcodeFavorite) {
  if (!showTrackRegularPriceCta(product)) return false;
  const code = String(product.barcode || "").trim();
  if (typeof isBarcodeFavorite === "function") return Boolean(isBarcodeFavorite(code));
  return false;
}

/**
 * @param {boolean} tracking
 * @returns {string}
 */
export function trackRegularPriceButtonLabel(tracking) {
  return tracking ? TRACK_REGULAR_LABEL_TRACKING : TRACK_REGULAR_LABEL_IDLE;
}
