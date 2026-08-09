import { resolveUniqueBarcode } from "./resolveCartBarcode";

const DRAFT_KEY = "cjenko_cart_draft_v1";

function safeParse(raw, fallback) {
  try {
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** Spremljena košarica (lanac + stavke) — preživljava promjenu taba. Ne dira izračun. */
export function loadCartDraft() {
  const data = safeParse(localStorage.getItem(DRAFT_KEY), null);
  if (!data || typeof data !== "object") {
    return { selectedChain: null, items: [] };
  }
  return {
    selectedChain: data.selectedChain || null,
    items: Array.isArray(data.items) ? data.items : [],
  };
}

export function saveCartDraft({ selectedChain, items }) {
  try {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        selectedChain: selectedChain || null,
        items: Array.isArray(items) ? items : [],
      })
    );
  } catch {
    // quota / private mode
  }
}

/**
 * Dodaj stavku iz skena/pretrage.
 * Oblik kompatibilan s CartPage (isti kao addFromSuggestion).
 * Ako nema barkoda — strogi lookup u regular_prices (točan naziv + lanac, 1 EAN).
 * Ne dira analyzeChainCart / cartCompare.
 */
export async function enqueueCartAdd(entry) {
  if (!entry?.name) return { ok: false, reason: "missing_name" };
  const draft = loadCartDraft();
  const chain = entry.chain || null;

  if (draft.selectedChain && chain && draft.selectedChain !== chain && draft.items.length > 0) {
    return {
      ok: false,
      reason: "chain_mismatch",
      selectedChain: draft.selectedChain,
      itemChain: chain,
    };
  }

  const name = String(entry.name).trim();
  let barcode = entry.barcode || null;
  if (!barcode && chain) {
    barcode = await resolveUniqueBarcode(name, chain);
  }

  const item = {
    id: crypto.randomUUID(),
    name,
    barcode,
    price: entry.price,
    originalPrice: entry.originalPrice ?? entry.price,
    priceSource: entry.priceSource === "sale" ? "sale" : "regular",
  };

  const nextChain = draft.selectedChain || chain || null;
  const nextItems = [...draft.items, item];
  saveCartDraft({ selectedChain: nextChain, items: nextItems });

  return { ok: true, selectedChain: nextChain, itemCount: nextItems.length };
}
