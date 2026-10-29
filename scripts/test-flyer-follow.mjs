/**
 * Logika praćenja letka + UI odluke + dokaz da Isključi čisti lokalno zrcalo.
 * Pokreni: npm run test:flyer-follow
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FLYER_FOLLOW_CHAINS,
  isFlyerFollowChain,
  needsEnableBeforeFollow,
  normalizeFollowedChains,
  planFollowChain,
  planUnfollowChain,
  shouldShowFlyerFollowButton,
} from "../src/lib/pushFlyerFollow.js";
import { resolveTrackedBarcodesForUpsert } from "../src/lib/pushTrackedBarcodes.js";

assert.deepEqual(FLYER_FOLLOW_CHAINS, ["Eurospin", "Kaufland", "Plodine"]);
assert.equal(isFlyerFollowChain("Kaufland"), true);
assert.equal(isFlyerFollowChain("Lidl"), false);
assert.equal(isFlyerFollowChain(""), false);

// Nedopušteni lanac odbijen
const bad = planFollowChain([], "Lidl");
assert.equal(bad.ok, false);
assert.equal(bad.reason, "not_allowed");

// Max 3
let cur = [];
for (const c of FLYER_FOLLOW_CHAINS) {
  const r = planFollowChain(cur, c);
  assert.equal(r.ok, true, c);
  cur = r.chains;
}
assert.equal(cur.length, 3);

// Već u listi: ok bez rasta
const again = planFollowChain(["Eurospin"], "Eurospin");
assert.equal(again.ok, true);
assert.deepEqual(again.chains, ["Eurospin"]);

// Četvrti (nedopušten) uz puna 3 — not_allowed; max kad bi bio dopušten
const over = planFollowChain(cur, "Lidl");
assert.equal(over.ok, false);
assert.equal(over.reason, "not_allowed");

// Unfollow
const gone = planUnfollowChain(["Eurospin", "Kaufland"], "Eurospin");
assert.equal(gone.ok, true);
assert.deepEqual(gone.chains, ["Kaufland"]);

assert.deepEqual(
  normalizeFollowedChains([
    "Lidl",
    "Eurospin",
    "Eurospin",
    "x",
    "Plodine",
    "Kaufland",
    "extra",
  ]),
  ["Eurospin", "Plodine", "Kaufland"]
);

// --- granted bez pretplate → mora enable (ne gledaj samo permission) ---
assert.equal(needsEnableBeforeFollow(null), true);
assert.equal(needsEnableBeforeFollow(undefined), true);
assert.equal(needsEnableBeforeFollow(""), true);
assert.equal(
  needsEnableBeforeFollow("https://fcm.googleapis.com/fcm/send/abc"),
  false
);

// --- nepodržan push → gumb se ne prikazuje ---
assert.equal(
  shouldShowFlyerFollowButton({
    chain: "Kaufland",
    isSupported: false,
    permission: "granted",
  }),
  false
);
assert.equal(
  shouldShowFlyerFollowButton({
    chain: "Kaufland",
    isSupported: true,
    permission: "default",
  }),
  true
);
assert.equal(
  shouldShowFlyerFollowButton({
    chain: "Lidl",
    isSupported: true,
    permission: "default",
  }),
  false
);

// --- odbijena dozvola: gumb sakriven; plan/stanje se ne mijenja ---
assert.equal(
  shouldShowFlyerFollowButton({
    chain: "Kaufland",
    isSupported: true,
    permission: "denied",
  }),
  false
);
const beforeDenied = ["Eurospin"];
assert.deepEqual(planFollowChain(beforeDenied, "Eurospin").chains, beforeDenied);
assert.deepEqual(
  planUnfollowChain(beforeDenied, "Kaufland").chains,
  beforeDenied
);

// --- upsert: prazan popis + neprazan lastSynced → lastSynced ---
const lastSynced = ["3850100000001", "3850100000002"];
assert.deepEqual(resolveTrackedBarcodesForUpsert([], lastSynced), lastSynced);
assert.deepEqual(resolveTrackedBarcodesForUpsert(null, lastSynced), lastSynced);
// Normalan tok: neprazan provided ostaje (ne miješa s lastSynced)
assert.deepEqual(
  resolveTrackedBarcodesForUpsert(["3850199999999"], lastSynced),
  ["3850199999999"]
);
// Oba prazna → []
assert.deepEqual(resolveTrackedBarcodesForUpsert([], []), []);
assert.deepEqual(resolveTrackedBarcodesForUpsert([], null), []);

// Isključi: clearPushLocalState mora maknuti lokalno zrcalo followed_chains.
// delete_push_subscription briše cijeli red → followed_chains nestaje u bazi.
const root = path.dirname(fileURLToPath(import.meta.url));
const pushSrc = fs.readFileSync(
  path.join(root, "../src/lib/pushNotifications.js"),
  "utf8"
);
assert.match(
  pushSrc,
  /const FOLLOWED_CHAINS_KEY = "cjenko_push_followed_chains"/
);
assert.match(pushSrc, /function clearFollowedChainsLocal\(\)/);
assert.match(pushSrc, /localStorage\.removeItem\(FOLLOWED_CHAINS_KEY\)/);
assert.match(pushSrc, /clearFollowedChainsLocal\(\)/);
assert.match(
  pushSrc,
  /function clearPushLocalState\(\)[\s\S]*clearFollowedChainsLocal\(\)/
);
// Upsert prije update_followed (isti RPC kao Favoriti)
assert.match(pushSrc, /async function upsertFromPushSubscription\(/);
assert.match(pushSrc, /export async function ensurePushSubscriptionUpserted\(/);
assert.match(
  pushSrc,
  /export async function followChain\([\s\S]*ensurePushSubscriptionUpserted\(/
);
assert.match(pushSrc, /notifyFollowedChainsChanged\(\)/);
assert.match(pushSrc, /cjenko-followed-chains-changed/);
// Zaštita: upsert ne šalje [] kad lastSynced nije prazan
assert.match(
  pushSrc,
  /resolveTrackedBarcodesForUpsert\(\s*trackedBarcodes\s*,\s*readLastSyncedBarcodes\(\)\s*\)/
);

// HomePage: enable prema endpointu, barkodovi iz favorita; loading → disabled
const homeSrc = fs.readFileSync(
  path.join(root, "../src/pages/HomePage.jsx"),
  "utf8"
);
assert.match(homeSrc, /resolvePushEndpoint\(\)/);
assert.match(homeSrc, /needsEnableBeforeFollow\(endpoint\)/);
assert.match(homeSrc, /barcodesFromFavorites\(favorites\)/);
assert.match(homeSrc, /enablePushNotifications\(barcodes\)/);
assert.doesNotMatch(
  homeSrc,
  /enablePushNotifications\(\[\]\)/
);
assert.match(homeSrc, /getFollowedChainsChangedEvent\(\)/);
assert.match(homeSrc, /shouldShowFlyerFollowButton\(/);
assert.match(homeSrc, /isPushSupported\(\)/);
assert.match(
  homeSrc,
  /followBlockedByFavoritesLoad = Boolean\(favoritesLoading\) && !following/
);
assert.match(homeSrc, /disabled=\{flyerDisabled\}/);
assert.match(homeSrc, /if \(favoritesLoading && !following\) return;/);
// Favoriti u učitavanju → nema puta koji zove upsert/enable s [] iz loada
assert.match(homeSrc, /favoritesLoading=\{favoritesLoading\}/);

const appSrc = fs.readFileSync(path.join(root, "../src/App.jsx"), "utf8");
assert.match(appSrc, /favoritesLoading=\{favoritesLoading\}/);

// SW: searchParams.set → &cjenko_from=push kad query već postoji
const swSrc = fs.readFileSync(path.join(root, "../src/sw.js"), "utf8");
assert.match(swSrc, /searchParams\.set\(\s*["']cjenko_from["']\s*,\s*["']push["']\s*\)/);

const withQuery = new URL("https://cjenko.app/?trgovina=Kaufland");
withQuery.searchParams.set("cjenko_from", "push");
assert.equal(
  withQuery.href,
  "https://cjenko.app/?trgovina=Kaufland&cjenko_from=push"
);
const bare = new URL("https://cjenko.app/");
bare.searchParams.set("cjenko_from", "push");
assert.equal(bare.href, "https://cjenko.app/?cjenko_from=push");

console.log("OK test-flyer-follow");
