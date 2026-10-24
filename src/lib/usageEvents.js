/**
 * Anonimno brojanje korištenja (samo ime događaja).
 * Skripta se ne učitava dok VITE_UMAMI_ENABLED !== "true".
 * Događaji: tab_home, tab_search, tab_cart, tab_fav, sken_otvoren, sken_uspjeh,
 * favorit_dodan, prati_cijenu, tap_redovna, kosarica_izracunaj, kosarica_dodan,
 * push_klik, push_ukljucen, push_odbijen, push_greska, push_otvoren, push_iskljucen,
 * otvoreno_iz_appa.
 */

const TAB_EVENTS = {
  home: "tab_home",
  search: "tab_search",
  cart: "tab_cart",
  fav: "tab_fav",
};

const QUEUE_LIMIT = 50;
const pendingEvents = [];
const seenTabs = new Set();
let pushOpenHandled = false;
let scriptInjected = false;
let flushTimer = null;
const otvorenoIzAppaState = { seen: false };

/** Chrome TWA / Custom Tab iz APK-a postavlja ovaj referrer (paket, ne display-mode). */
export const ANDROID_APP_REFERRER_PREFIX = "android-app://app.cjenko.akcije";

export function isUsageEnabled() {
  return (
    String(import.meta.env.VITE_UMAMI_ENABLED || "") === "true" &&
    Boolean(String(import.meta.env.VITE_UMAMI_WEBSITE_ID || "").trim())
  );
}

function umamiTrack() {
  const umami = typeof window !== "undefined" ? window.umami : null;
  return umami && typeof umami.track === "function" ? umami.track : null;
}

/** Čeka umami.track; noviji iznad limita se odbacuju. */
export function enqueueEvent(queue, name) {
  if (queue.length >= QUEUE_LIMIT) return;
  queue.push(name);
}

function flushQueuedEvents() {
  const send = umamiTrack();
  if (!send) return false;
  while (pendingEvents.length) {
    send(pendingEvents.shift());
  }
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  return true;
}

function scheduleFlush() {
  if (flushTimer || !isUsageEnabled()) return;
  let tries = 0;
  flushTimer = setInterval(() => {
    tries += 1;
    if (flushQueuedEvents() || tries >= 40) {
      if (flushTimer) {
        clearInterval(flushTimer);
        flushTimer = null;
      }
    }
  }, 250);
}

/** Samo ime događaja — bez svojstava, barkoda, naziva, lanca. */
export function track(name) {
  const eventName = String(name || "").trim();
  if (!eventName) return;
  if (!isUsageEnabled()) return;
  const send = umamiTrack();
  if (send) {
    send(eventName);
    return;
  }
  enqueueEvent(pendingEvents, eventName);
  scheduleFlush();
}

/** Jednom po tabu po otvaranju aplikacije (memorija, ne localStorage). */
export function trackTabOnce(tab) {
  const key = String(tab || "");
  const eventName = TAB_EVENTS[key];
  if (!eventName || seenTabs.has(key)) return;
  seenTabs.add(key);
  track(eventName);
}

export function trackSkenOtvoren() {
  track("sken_otvoren");
}

export function trackSkenUspjeh() {
  track("sken_uspjeh");
}

export function trackFavoritDodan() {
  track("favorit_dodan");
}

export function trackPratiCijenu() {
  track("prati_cijenu");
}

export function trackTapRedovna() {
  track("tap_redovna");
}

export function trackKosaricaIzracunaj() {
  track("kosarica_izracunaj");
}

/** kosarica_dodan — samo ime; samo kad je stavka stvarno dodana. */
export function shouldTrackKosaricaDodan(ok) {
  return ok === true;
}

export function trackKosaricaDodan() {
  track("kosarica_dodan");
}

export function notifyCartAdded(ok) {
  if (!shouldTrackKosaricaDodan(ok)) return false;
  trackKosaricaDodan();
  return true;
}

/**
 * Pouzdano za Play TWA / Custom Tab iz app.cjenko.akcije.
 * display-mode:standalone namjerno nije: broji i PWA s početnog ekrana (Chrome),
 * a propušta Custom Tab fallback iz istog APK-a.
 */
export function isAndroidAppLaunch(referrer) {
  return String(referrer || "")
    .trim()
    .toLowerCase()
    .startsWith(ANDROID_APP_REFERRER_PREFIX);
}

export function consumeOtvorenoIzAppa(referrer, state = otvorenoIzAppaState) {
  if (state.seen) return false;
  if (!isAndroidAppLaunch(referrer)) return false;
  state.seen = true;
  return true;
}

export function trackOtvorenoIzAppa() {
  track("otvoreno_iz_appa");
}

export function trackPushKlik() {
  track("push_klik");
}

export function trackPushUkljucen() {
  track("push_ukljucen");
}

export function trackPushOdbijen() {
  track("push_odbijen");
}

export function trackPushGreska() {
  track("push_greska");
}

export function trackPushOtvoren() {
  track("push_otvoren");
}

/** push_iskljucen — korisnik je isključio obavijesti (samo ime događaja). */
export function trackPushIskljucen() {
  track("push_iskljucen");
}

function stripPushOpenParam() {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get("cjenko_from") !== "push") return false;
    url.searchParams.delete("cjenko_from");
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(window.history.state, "", next);
    return true;
  } catch {
    return false;
  }
}

function consumePushOpenFromUrl() {
  if (pushOpenHandled) return;
  if (stripPushOpenParam()) {
    pushOpenHandled = true;
    trackPushOtvoren();
  }
}

function onSwMessage(event) {
  if (event?.data?.type === "CJENKO_PUSH_OPEN") {
    if (pushOpenHandled) return;
    pushOpenHandled = true;
    trackPushOtvoren();
  }
}

/**
 * Učitaj Umami samo kad je eksplicitno uključeno.
 * data-auto-pageview=false — tabovi idu kao custom events, ne kao pageview.
 */
export function initUsageTracking() {
  if (typeof window === "undefined") return;
  consumePushOpenFromUrl();
  if (consumeOtvorenoIzAppa(document.referrer)) {
    trackOtvorenoIzAppa();
  }
  if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener("message", onSwMessage);
  }
  if (!isUsageEnabled() || scriptInjected) return;
  const websiteId = String(import.meta.env.VITE_UMAMI_WEBSITE_ID || "").trim();
  const src =
    String(import.meta.env.VITE_UMAMI_SCRIPT_URL || "").trim() ||
    "https://cloud.umami.is/script.js";
  const el = document.createElement("script");
  el.defer = true;
  el.src = src;
  el.setAttribute("data-website-id", websiteId);
  el.setAttribute("data-auto-pageview", "false");
  el.setAttribute("data-exclude-search", "true");
  el.setAttribute("data-exclude-hash", "true");
  el.setAttribute("data-domains", "cjenko.app,www.cjenko.app");
  el.addEventListener("load", () => {
    flushQueuedEvents();
    scheduleFlush();
  });
  document.head.appendChild(el);
  scriptInjected = true;
  scheduleFlush();
}
