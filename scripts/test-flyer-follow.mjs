/**
 * Logika praćenja letka + dokaz da Isključi čisti lokalno zrcalo.
 * Pokreni: npm run test:flyer-follow
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FLYER_FOLLOW_CHAINS,
  isFlyerFollowChain,
  normalizeFollowedChains,
  planFollowChain,
  planUnfollowChain,
} from "../src/lib/pushFlyerFollow.js";

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

// Odbijena dozvola: UI ne zove follow → plan/stanje se ne mijenja
const beforeDenied = ["Eurospin"];
assert.deepEqual(planFollowChain(beforeDenied, "Eurospin").chains, beforeDenied);

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
assert.match(pushSrc, /function clearPushLocalState\(\)[\s\S]*clearFollowedChainsLocal\(\)/);

console.log("OK test-flyer-follow");
