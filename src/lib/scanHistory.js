const HISTORY_KEY = "cjenko_scan_history_v1";
const MAX = 12;

function safeParse(raw, fallback) {
  try {
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** Lokalna povijest skeniranih barkodova (samo uređaj, besplatno). */
export function loadScanHistory() {
  const list = safeParse(localStorage.getItem(HISTORY_KEY), []);
  return Array.isArray(list) ? list : [];
}

export function pushScanHistory({ barcode, name = null, found = false }) {
  const code = String(barcode || "").trim();
  if (!code) return loadScanHistory();

  const prev = loadScanHistory().filter((e) => e.barcode !== code);
  const next = [
    {
      barcode: code,
      name: name || null,
      found: Boolean(found),
      at: new Date().toISOString(),
    },
    ...prev,
  ].slice(0, MAX);

  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export function clearScanHistory() {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    // ignore
  }
  return [];
}
