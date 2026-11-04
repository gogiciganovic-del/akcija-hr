/**
 * Gate za onboarding sheet (FAZA 2A).
 * Samo čitanje flaga + pravila tko smije vidjeti — bez UI-ja.
 *
 * Ključevi usklađeni s useFavorites / pushNotifications / cartDraft.
 */

export const ONBOARDING_DONE_KEY = "cjenko_onboarding_done";
export const ONBOARDING_DONE_VALUE = "1";

/** Isti stringovi kao u postojećim modulima (ne uvozimo ih da gate ostane bez side-effecta). */
export const FAVORITES_KEY = "akcije_favorites";
export const PUSH_ENDPOINT_KEY = "cjenko_push_endpoint";
export const FOLLOWED_CHAINS_KEY = "cjenko_push_followed_chains";
export const CART_DRAFT_KEY = "cjenko_cart_draft_v1";

const BOT_UA_RE = /bot|crawl|spider|googlebot|lighthouse/i;

function resolveStorage(storage) {
  if (storage) return storage;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function safeGetItem(storage, key) {
  try {
    return storage?.getItem?.(key) ?? null;
  } catch {
    return null;
  }
}

function hasNonEmptyFavorites(raw) {
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.length > 0;
    if (parsed && typeof parsed === "object") return Object.keys(parsed).length > 0;
    return false;
  } catch {
    return false;
  }
}

function hasPushEndpoint(raw) {
  return typeof raw === "string" && raw.trim().length > 0;
}

function hasFollowedChains(raw) {
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return false;
    return parsed.some((c) => String(c || "").trim());
  } catch {
    return false;
  }
}

function hasCartDraft(raw) {
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return false;
    if (Array.isArray(parsed.items) && parsed.items.length > 0) return true;
    return false;
  } catch {
    return false;
  }
}

function isReturningUser(storage) {
  if (!storage) return false;
  try {
    if (hasNonEmptyFavorites(safeGetItem(storage, FAVORITES_KEY))) return true;
    if (hasPushEndpoint(safeGetItem(storage, PUSH_ENDPOINT_KEY))) return true;
    if (hasFollowedChains(safeGetItem(storage, FOLLOWED_CHAINS_KEY))) return true;
    if (hasCartDraft(safeGetItem(storage, CART_DRAFT_KEY))) return true;
    return false;
  } catch {
    return true;
  }
}

function isOnboardingDone(storage) {
  try {
    if (!storage) return true;
    return storage.getItem(ONBOARDING_DONE_KEY) === ONBOARDING_DONE_VALUE;
  } catch {
    // Nečitljiv storage → tretiraj kao done (ne prikazuj opet).
    return true;
  }
}

function isBotUserAgent(ua) {
  return BOT_UA_RE.test(String(ua || ""));
}

function searchHasBlockedParam(search) {
  try {
    const q = String(search || "");
    const params = new URLSearchParams(
      q.startsWith("?") ? q.slice(1) : q
    );
    if (params.has("trgovina")) return true;
    if (params.has("notrack")) return true;
    return false;
  } catch {
    return true;
  }
}

/**
 * Treba li prikazati onboarding (UI će kasnije još čekati ~3s).
 *
 * @param {{
 *   storage?: Storage | { getItem: Function, setItem?: Function, removeItem?: Function } | null,
 *   userAgent?: string,
 *   search?: string,
 * }} [opts]
 * @returns {boolean}
 */
export function shouldShowOnboarding(opts = {}) {
  try {
    const ua =
      opts.userAgent ??
      (typeof navigator !== "undefined" ? navigator.userAgent : "");
    if (isBotUserAgent(ua)) return false;

    const search =
      opts.search ??
      (typeof window !== "undefined" ? window.location?.search || "" : "");
    if (searchHasBlockedParam(search)) return false;

    const storage = resolveStorage(opts.storage);
    if (!storage) return false;

    // Ako getItem baca (private mode / denied) → ne prikazuj.
    try {
      storage.getItem(ONBOARDING_DONE_KEY);
    } catch {
      return false;
    }

    if (isOnboardingDone(storage)) return false;
    if (isReturningUser(storage)) return false;

    return true;
  } catch {
    return false;
  }
}

/** Označi onboarding kao završen / preskočen. */
export function markOnboardingDone(storage) {
  try {
    const s = resolveStorage(storage);
    if (!s) return;
    s.setItem(ONBOARDING_DONE_KEY, ONBOARDING_DONE_VALUE);
  } catch {
    // quota / private mode
  }
}

export function readOnboardingDone(storage) {
  try {
    return isOnboardingDone(resolveStorage(storage));
  } catch {
    return true;
  }
}
