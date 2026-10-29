import { supabase } from "./supabase";
import { disablePushSequence } from "./pushDisable";
import {
  isFlyerFollowChain,
  normalizeFollowedChains,
  planFollowChain,
  planUnfollowChain,
} from "./pushFlyerFollow";
import {
  barcodesFromFavorites,
  favoriteHasTrackableBarcode,
  isTrackableBarcode,
  planTrackedBarcodesUpdate,
  resolveTrackedBarcodesForUpsert,
} from "./pushTrackedBarcodes";

export {
  barcodesFromFavorites,
  favoriteHasTrackableBarcode,
  isTrackableBarcode,
  planTrackedBarcodesUpdate,
  resolveTrackedBarcodesForUpsert,
};
export {
  FLYER_FOLLOW_CHAINS,
  isFlyerFollowChain,
  normalizeFollowedChains,
  needsEnableBeforeFollow,
  planFollowChain,
  planUnfollowChain,
  shouldShowFlyerFollowButton,
} from "./pushFlyerFollow";
export { disablePushSequence } from "./pushDisable";

const ENDPOINT_STORAGE_KEY = "cjenko_push_endpoint";
const LAST_TRACKED_KEY = "cjenko_push_tracked_barcodes";
const FOLLOWED_CHAINS_KEY = "cjenko_push_followed_chains";

/**
 * @param {string} base64String
 * @returns {Uint8Array}
 */
export function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

export function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

function readLastSyncedBarcodes() {
  try {
    const raw = localStorage.getItem(LAST_TRACKED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((b) => String(b || "").trim()).filter(isTrackableBarcode);
  } catch {
    return [];
  }
}

function writeLastSyncedBarcodes(barcodes) {
  try {
    localStorage.setItem(
      LAST_TRACKED_KEY,
      JSON.stringify((barcodes || []).slice(0, 500))
    );
  } catch {
    // ignore
  }
}

/**
 * @returns {'unsupported' | 'denied' | 'default' | 'granted'}
 */
export function getNotificationPermission() {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

function rememberEndpoint(endpoint) {
  try {
    if (endpoint) localStorage.setItem(ENDPOINT_STORAGE_KEY, endpoint);
    else localStorage.removeItem(ENDPOINT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function getRememberedEndpoint() {
  try {
    return localStorage.getItem(ENDPOINT_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

/**
 * Upsert pretplate (RPC SECURITY DEFINER — bez SELECT curenja).
 * @param {{ endpoint: string, p256dh: string, auth: string, tracked_barcodes: string[] }} row
 */
async function upsertPushSubscription(row) {
  const { error } = await supabase.rpc("upsert_push_subscription", {
    p_endpoint: row.endpoint,
    p_p256dh: row.p256dh,
    p_auth: row.auth,
    p_tracked_barcodes: row.tracked_barcodes,
  });
  if (error) throw error;
}

/**
 * Ažuriraj samo tracked_barcodes za postojeći endpoint.
 * @param {string} endpoint
 * @param {string[]} barcodes
 */
export async function updateTrackedBarcodes(endpoint, barcodes) {
  if (!endpoint) return;
  const { error } = await supabase.rpc("update_push_tracked_barcodes", {
    p_endpoint: endpoint,
    p_tracked_barcodes: barcodes.slice(0, 500),
  });
  if (error) throw error;
}

/**
 * Upsert retka pretplate iz postojeće browser PushSubscription
 * (isti RPC kao Favoriti / enablePushNotifications).
 * upsert_push_subscription NE briše followed_chains (smoke E).
 * @param {PushSubscription} sub
 * @param {string[]} trackedBarcodes
 * @returns {Promise<string>} endpoint
 */
async function upsertFromPushSubscription(sub, trackedBarcodes = []) {
  const json = sub.toJSON();
  const endpoint = json.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    throw new Error("Push pretplata nema potpune ključeve");
  }
  const tracked = resolveTrackedBarcodesForUpsert(
    trackedBarcodes,
    readLastSyncedBarcodes()
  );
  await upsertPushSubscription({
    endpoint,
    p256dh,
    auth,
    tracked_barcodes: tracked,
  });
  rememberEndpoint(endpoint);
  writeLastSyncedBarcodes(tracked);
  return endpoint;
}

/**
 * Ako browser već ima pretplatu — upsert retka u bazi (bez requestPermission).
 * @param {string[]} trackedBarcodes
 * @returns {Promise<string|null>} endpoint ili null ako nema sub
 */
export async function ensurePushSubscriptionUpserted(trackedBarcodes = []) {
  if (!isPushSupported()) return null;
  if (Notification.permission !== "granted") return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return null;
    return await upsertFromPushSubscription(sub, trackedBarcodes);
  } catch {
    return null;
  }
}

/**
 * @param {string[]} trackedBarcodes
 * @returns {Promise<PushSubscription>}
 */
export async function enablePushNotifications(trackedBarcodes = []) {
  if (!isPushSupported()) {
    throw new Error("Push nije podržan u ovom pregledniku");
  }

  const vapidPublic = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidPublic || typeof vapidPublic !== "string") {
    throw new Error("Nedostaje VITE_VAPID_PUBLIC_KEY");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    const err = new Error(
      permission === "denied"
        ? "Obavijesti su blokirane u postavkama preglednika"
        : "Dozvola za obavijesti nije dana"
    );
    err.code = permission;
    throw err;
  }

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublic),
    });
  }

  await upsertFromPushSubscription(sub, trackedBarcodes);
  return sub;
}

const FOLLOWED_CHAINS_CHANGED = "cjenko-followed-chains-changed";

function notifyFollowedChainsChanged() {
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(FOLLOWED_CHAINS_CHANGED));
    }
  } catch {
    // ignore
  }
}

export function readFollowedChains() {
  try {
    const raw = localStorage.getItem(FOLLOWED_CHAINS_KEY);
    if (!raw) return [];
    return normalizeFollowedChains(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function writeFollowedChains(chains) {
  try {
    localStorage.setItem(
      FOLLOWED_CHAINS_KEY,
      JSON.stringify(normalizeFollowedChains(chains))
    );
  } catch {
    // ignore
  }
  notifyFollowedChainsChanged();
}

function clearFollowedChainsLocal() {
  try {
    localStorage.removeItem(FOLLOWED_CHAINS_KEY);
  } catch {
    // ignore
  }
  notifyFollowedChainsChanged();
}

/** Event name — StoreInfoBar sluša da osvježi following nakon Isključi. */
export function getFollowedChainsChangedEvent() {
  return FOLLOWED_CHAINS_CHANGED;
}

/**
 * Ažuriraj followed_chains za postojeći endpoint (RPC).
 * @param {string} endpoint
 * @param {string[]} chains
 */
export async function updateFollowedChains(endpoint, chains) {
  if (!endpoint) return;
  const { error } = await supabase.rpc("update_push_followed_chains", {
    p_endpoint: endpoint,
    p_chains: normalizeFollowedChains(chains),
  });
  if (error) throw error;
}

export async function resolvePushEndpoint() {
  if (isPushSupported()) {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub?.endpoint) {
        rememberEndpoint(sub.endpoint);
        return sub.endpoint;
      }
    } catch {
      // pad na zapamćeni
    }
  }
  return getRememberedEndpoint();
}

/**
 * Prati lanac za „novi letak”. Zahtijeva postojeću push pretplatu (endpoint).
 * Prije update_push_followed_chains upserta red (isti RPC kao Favoriti) —
 * upsert ne briše followed_chains (smoke E).
 * @param {string} chain
 * @param {{ trackedBarcodes?: string[] }} [opts]
 * @returns {Promise<{ ok: boolean, reason?: string, chains?: string[] }>}
 */
export async function followChain(chain, opts = {}) {
  if (!isFlyerFollowChain(chain)) {
    return { ok: false, reason: "not_allowed" };
  }
  const tracked = Array.isArray(opts.trackedBarcodes) ? opts.trackedBarcodes : [];
  // Osiguraj red u bazi (browser sub → upsert_push_subscription).
  let endpoint = await ensurePushSubscriptionUpserted(tracked);
  if (!endpoint) {
    endpoint = await resolvePushEndpoint();
  }
  if (!endpoint) {
    return { ok: false, reason: "no_subscription" };
  }
  const plan = planFollowChain(readFollowedChains(), chain);
  if (!plan.ok) return plan;
  await updateFollowedChains(endpoint, plan.chains);
  writeFollowedChains(plan.chains);
  return { ok: true, chains: plan.chains };
}

/**
 * Prestani pratiti lanac.
 * @param {string} chain
 * @returns {Promise<{ ok: boolean, reason?: string, chains?: string[] }>}
 */
export async function unfollowChain(chain) {
  const endpoint = await resolvePushEndpoint();
  if (!endpoint) {
    const local = planUnfollowChain(readFollowedChains(), chain);
    writeFollowedChains(local.chains);
    return { ok: true, chains: local.chains, reason: "local_only" };
  }
  const plan = planUnfollowChain(readFollowedChains(), chain);
  if (!plan.ok) return plan;
  await updateFollowedChains(endpoint, plan.chains);
  writeFollowedChains(plan.chains);
  return { ok: true, chains: plan.chains };
}

function clearPushLocalState() {
  rememberEndpoint("");
  try {
    localStorage.removeItem(LAST_TRACKED_KEY);
  } catch {
    // ignore
  }
  clearFollowedChainsLocal();
}

/**
 * Isključi push: unsubscribe, RPC delete, pa očisti localStorage.
 * Ako RPC padne, lokalno se ipak odjavi i očisti — UI pokaže poruku.
 * @returns {Promise<{ remoteOk: boolean, endpoint: string }>}
 */
export async function disablePushNotifications() {
  return disablePushSequence({
    getSubscription: async () => {
      if (isPushSupported()) {
        try {
          const reg = await navigator.serviceWorker.ready;
          const sub = await reg.pushManager.getSubscription();
          if (sub) return sub;
        } catch {
          // pad na zapamćeni endpoint
        }
      }
      const remembered = getRememberedEndpoint();
      return remembered ? { endpoint: remembered } : null;
    },
    unsubscribe: async (sub) => {
      if (typeof sub?.unsubscribe === "function") {
        await sub.unsubscribe();
      }
    },
    deleteRemote: async (endpoint) => {
      const { error } = await supabase.rpc("delete_push_subscription", {
        p_endpoint: endpoint,
      });
      if (error) throw error;
    },
    clearLocal: clearPushLocalState,
  });
}

/**
 * Sinkroniziraj tracked_barcodes ako postoji aktivna pretplata.
 * @param {Map<string, any>} favorites
 * @param {{ isInitialLoad?: boolean }} [opts]
 */
export async function syncPushTrackedBarcodes(favorites, opts = {}) {
  if (!isPushSupported()) return;
  if (Notification.permission !== "granted") return;

  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    const endpoint = sub?.endpoint || getRememberedEndpoint();
    if (!endpoint) return;

    const plan = planTrackedBarcodesUpdate(favorites, {
      ...opts,
      previousSynced: readLastSyncedBarcodes(),
    });
    if (!plan.apply) return;

    await updateTrackedBarcodes(endpoint, plan.barcodes);
    writeLastSyncedBarcodes(plan.barcodes);
  } catch {
    // tiho — sync nije kritičan za UI
  }
}
