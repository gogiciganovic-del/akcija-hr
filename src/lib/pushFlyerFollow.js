/**
 * Čista logika praćenja letka (Eurospin / Kaufland / Plodine).
 * Max 3 lanca — isto što i CHECK u bazi.
 */

export const FLYER_FOLLOW_CHAINS = Object.freeze([
  "Eurospin",
  "Kaufland",
  "Plodine",
]);

const ALLOWED = new Set(FLYER_FOLLOW_CHAINS);

export function isFlyerFollowChain(chain) {
  return ALLOWED.has(String(chain || "").trim());
}

/**
 * @param {string[]} current
 * @param {string} chain
 * @returns {{ ok: true, chains: string[] } | { ok: false, reason: string }}
 */
export function planFollowChain(current, chain) {
  const c = String(chain || "").trim();
  if (!isFlyerFollowChain(c)) {
    return { ok: false, reason: "not_allowed" };
  }
  const base = normalizeFollowedChains(current);
  if (base.includes(c)) {
    return { ok: true, chains: base };
  }
  if (base.length >= 3) {
    return { ok: false, reason: "max" };
  }
  return { ok: true, chains: [...base, c] };
}

/**
 * @param {string[]} current
 * @param {string} chain
 * @returns {{ ok: true, chains: string[] } | { ok: false, reason: string }}
 */
export function planUnfollowChain(current, chain) {
  const c = String(chain || "").trim();
  const base = normalizeFollowedChains(current);
  if (!base.includes(c)) {
    return { ok: true, chains: base };
  }
  return { ok: true, chains: base.filter((x) => x !== c) };
}

/** @param {unknown} raw */
export function normalizeFollowedChains(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    const c = String(item || "").trim();
    if (!isFlyerFollowChain(c)) continue;
    if (out.includes(c)) continue;
    out.push(c);
    if (out.length >= 3) break;
  }
  return out;
}

/**
 * Prikaz gumba: samo dopušteni lanac + podržan push + dozvola nije denied.
 * @param {{ chain: string, isSupported: boolean, permission: string }} opts
 */
export function shouldShowFlyerFollowButton({ chain, isSupported, permission }) {
  if (!isFlyerFollowChain(chain)) return false;
  if (!isSupported) return false;
  if (permission === "denied" || permission === "unsupported") return false;
  return true;
}

/**
 * Uključi push (enable) ako nema stvarne pretplate — ne gledaj samo Notification.permission.
 * @param {string|null|undefined} endpoint
 */
export function needsEnableBeforeFollow(endpoint) {
  return !endpoint;
}
