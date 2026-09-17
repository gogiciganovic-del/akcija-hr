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

function normalizeLineOverrides(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return { ...raw };
}

/**
 * Nakon brisanja stavke na `removedIndex`: obriši overridee tog retka na svim
 * lancima i pomakni veće indekse za -1 (`${chain}:${i+1}` → `${chain}:${i}`).
 */
export function reindexLineOverrides(overrides, removedIndex) {
  const src = normalizeLineOverrides(overrides);
  if (!Number.isInteger(removedIndex) || removedIndex < 0) return src;
  const next = {};
  for (const [key, value] of Object.entries(src)) {
    const sep = key.lastIndexOf(":");
    if (sep < 0) continue;
    const chain = key.slice(0, sep);
    const idx = Number(key.slice(sep + 1));
    if (!Number.isInteger(idx) || idx < 0) continue;
    if (idx === removedIndex) continue;
    const newIdx = idx > removedIndex ? idx - 1 : idx;
    next[`${chain}:${newIdx}`] = value;
  }
  return next;
}

/** Spremljena košarica (lanac + stavke + ručne zamjene) — preživljava tab. Ne dira izračun. */
export function loadCartDraft() {
  const data = safeParse(localStorage.getItem(DRAFT_KEY), null);
  if (!data || typeof data !== "object") {
    return { selectedChain: null, items: [], lineOverrides: {} };
  }
  return {
    selectedChain: data.selectedChain || null,
    items: Array.isArray(data.items) ? data.items : [],
    lineOverrides: normalizeLineOverrides(data.lineOverrides),
  };
}

export function saveCartDraft({ selectedChain, items, lineOverrides }) {
  try {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        selectedChain: selectedChain || null,
        items: Array.isArray(items) ? items : [],
        lineOverrides: normalizeLineOverrides(lineOverrides),
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
  saveCartDraft({
    selectedChain: nextChain,
    items: nextItems,
    lineOverrides: draft.lineOverrides,
  });

  return { ok: true, selectedChain: nextChain, itemCount: nextItems.length };
}
