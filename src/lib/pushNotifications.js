import { supabase } from "./supabase";

const ENDPOINT_STORAGE_KEY = "cjenko_push_endpoint";

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

/**
 * @param {Map<string, { barcode?: string|null }> | Iterable<{ barcode?: string|null }>} favorites
 * @returns {string[]}
 */
export function barcodesFromFavorites(favorites) {
  const values =
    favorites instanceof Map
      ? [...favorites.values()]
      : favorites
        ? [...favorites]
        : [];
  const set = new Set();
  for (const p of values) {
    const bc = String(p?.barcode || "").trim();
    if (bc.length >= 8) set.add(bc);
  }
  return [...set].slice(0, 500);
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

  const json = sub.toJSON();
  const endpoint = json.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    throw new Error("Push pretplata nema potpune ključeve");
  }

  await upsertPushSubscription({
    endpoint,
    p256dh,
    auth,
    tracked_barcodes: trackedBarcodes.slice(0, 500),
  });
  rememberEndpoint(endpoint);
  return sub;
}

/**
 * Sinkroniziraj tracked_barcodes ako postoji aktivna pretplata.
 * @param {Map<string, any>} favorites
 */
export async function syncPushTrackedBarcodes(favorites) {
  if (!isPushSupported()) return;
  if (Notification.permission !== "granted") return;

  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    const endpoint = sub?.endpoint || getRememberedEndpoint();
    if (!endpoint) return;

    const barcodes = barcodesFromFavorites(favorites);
    await updateTrackedBarcodes(endpoint, barcodes);
  } catch {
    // tiho — sync nije kritičan za UI
  }
}
