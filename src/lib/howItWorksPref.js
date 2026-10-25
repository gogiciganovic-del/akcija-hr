/** localStorage: "1" = otvoreno. Prazan ključ / sve ostalo = zatvoreno. */
export const HOW_IT_WORKS_OPEN_KEY = "cjenko_how_it_works_open";
const OPEN_VALUE = "1";

function resolveStorage(storage) {
  if (storage) return storage;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readHowItWorksOpen(storage) {
  try {
    return resolveStorage(storage)?.getItem(HOW_IT_WORKS_OPEN_KEY) === OPEN_VALUE;
  } catch {
    return false;
  }
}

export function writeHowItWorksOpen(open, storage) {
  try {
    const s = resolveStorage(storage);
    if (!s) return;
    s.setItem(HOW_IT_WORKS_OPEN_KEY, open ? OPEN_VALUE : "0");
  } catch {
    // quota / private mode
  }
}
