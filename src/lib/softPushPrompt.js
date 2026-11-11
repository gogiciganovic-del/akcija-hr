/**
 * Soft push upit nakon favorita — čista logika (bez React / Notification API).
 */

import { isFlyerFollowChain } from "./pushFlyerFollow.js";
import { isTrackableBarcode } from "./pushTrackedBarcodes.js";
import { chainFromStoreName } from "./constants.js";

export const SOFT_PUSH_DONE_KEY = "cjenko_soft_push_prompt_done";
export const SOFT_PUSH_DONE_VALUE = "1";

export const SOFT_PUSH_LABEL_PRICE = "Obavijesti me kad cijena padne";
export const SOFT_PUSH_LABEL_FLYER_PREFIX = "Obavijesti me kad izađe novi letak u ";

function resolveStorage(storage) {
  if (storage) return storage;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** @returns {boolean} true ako je soft upit već prikazan/zatvoren */
export function isSoftPushPromptDone(storage) {
  try {
    const s = resolveStorage(storage);
    if (!s) return true; // bez LS → ne prikazuj
    return s.getItem(SOFT_PUSH_DONE_KEY) === SOFT_PUSH_DONE_VALUE;
  } catch {
    return true;
  }
}

export function markSoftPushPromptDone(storage) {
  try {
    const s = resolveStorage(storage);
    if (!s) return;
    s.setItem(SOFT_PUSH_DONE_KEY, SOFT_PUSH_DONE_VALUE);
  } catch {
    // quota / private mode
  }
}

/**
 * Lanac proizvoda (chain ili iz store imena).
 * @param {{ chain?: string|null, store?: string|null }} product
 */
export function productChainId(product) {
  const direct = String(product?.chain || "").trim();
  if (direct) return direct;
  return chainFromStoreName(product?.store) || null;
}

/**
 * Što soft upit može ponuditi za ovaj favorit — null ako obećanje ne vrijedi.
 * Barkod ima prednost nad letkom.
 * @param {{ barcode?: string|null, chain?: string|null, store?: string|null }} product
 * @returns {{ kind: "price", barcode: string, message: string } | { kind: "flyer", chain: string, message: string } | null}
 */
export function resolveSoftPushOffer(product) {
  if (!product || typeof product !== "object") return null;
  const barcode = String(product.barcode || "").trim();
  if (isTrackableBarcode(barcode)) {
    return {
      kind: "price",
      barcode,
      message: SOFT_PUSH_LABEL_PRICE,
    };
  }
  const chain = productChainId(product);
  if (chain && isFlyerFollowChain(chain)) {
    return {
      kind: "flyer",
      chain,
      message: `${SOFT_PUSH_LABEL_FLYER_PREFIX}${chain}`,
    };
  }
  return null;
}

/**
 * Smije li se soft upit prikazati nakon dodavanja favorita.
 * @param {{
 *   pushStatus?: string,
 *   product?: object|null,
 *   storage?: Storage|{getItem:Function,setItem?:Function}|null,
 *   sessionBlocked?: boolean,
 * }} [opts]
 */
export function shouldShowSoftPushPrompt(opts = {}) {
  if (opts.sessionBlocked) return false;
  if (opts.pushStatus !== "prompt") return false;
  if (isSoftPushPromptDone(opts.storage)) return false;
  return resolveSoftPushOffer(opts.product) != null;
}
