/**
 * Jedan Umami pageview po sesiji + očuvanje ?utm_source / referrer.
 * Pokreni: npm run test:umami-pageview
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  trackPageviewOnce,
  sendPageviewPayload,
  snapshotPageviewContext,
  pageviewUrlFromLocation,
} from "../src/lib/usageEvents.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(__dir, "../src/lib/usageEvents.js"), "utf8");

assert.match(src, /data-auto-pageview["']?\s*,\s*["']false["']/);
assert.match(src, /data-exclude-search["']?\s*,\s*["']true["']/);
assert.match(src, /trackPageviewOnce\(\)/);
assert.match(src, /sendPageviewPayload/);
// pageview mora ići PRIJE strip push parama
const pvIdx = src.indexOf("trackPageviewOnce();");
const stripIdx = src.indexOf("consumePushOpenFromUrl();");
assert.ok(pvIdx >= 0 && stripIdx > pvIdx, "pageview prije consumePushOpenFromUrl");

assert.equal(
  pageviewUrlFromLocation({ pathname: "/", search: "?utm_source=tiktok" }),
  "/?utm_source=tiktok"
);
assert.equal(
  pageviewUrlFromLocation({ pathname: "/x", search: "" }),
  "/x"
);

const snap = snapshotPageviewContext({
  location: { pathname: "/", search: "?utm_source=tiktok&bf=1" },
  documentRef: { referrer: "https://www.tiktok.com/" },
});
assert.equal(snap.url, "/?utm_source=tiktok&bf=1");
assert.equal(snap.referrer, "https://www.tiktok.com/");

const calls = [];
const send = (arg) => {
  if (typeof arg === "function") {
    calls.push(arg({ website: "w", url: "/stripped", referrer: "" }));
  } else {
    calls.push(arg);
  }
};

// disabled → skip
assert.equal(
  trackPageviewOnce({
    enabled: false,
    send,
    state: { sent: false, pending: false, url: null, referrer: null },
  }),
  "skipped"
);
assert.equal(calls.length, 0);

// ready → pageview s eksplicitnim url (utm) + referrer
const st1 = { sent: false, pending: false, url: null, referrer: null };
assert.equal(
  trackPageviewOnce({
    enabled: true,
    send,
    state: st1,
    url: "/?utm_source=tiktok",
    referrer: "https://t.co/x",
  }),
  "sent"
);
assert.equal(calls.length, 1);
assert.equal(calls[0].url, "/?utm_source=tiktok", "utm_source ostaje u pageview url");
assert.equal(calls[0].referrer, "https://t.co/x");
assert.equal(calls[0].name, undefined, "nije custom event");
assert.equal(st1.sent, true);

// drugi put → skip
assert.equal(
  trackPageviewOnce({
    enabled: true,
    send,
    state: st1,
    url: "/?utm_source=other",
  }),
  "skipped"
);
assert.equal(calls.length, 1);

// queue: snimi utm odmah, pošalji kasnije s istim url-om
const st2 = { sent: false, pending: false, url: null, referrer: null };
assert.equal(
  trackPageviewOnce({
    enabled: true,
    send: null,
    state: st2,
    schedule: false,
    url: "/?utm_source=tiktok",
    referrer: "https://www.tiktok.com/@cjenko",
  }),
  "queued"
);
assert.equal(st2.pending, true);
assert.equal(st2.url, "/?utm_source=tiktok");
assert.equal(st2.referrer, "https://www.tiktok.com/@cjenko");
// flush-ekvivalent
sendPageviewPayload(send, st2);
st2.sent = true;
st2.pending = false;
assert.equal(calls[1].url, "/?utm_source=tiktok");
assert.match(calls[1].referrer, /tiktok/);

console.log("OK test-umami-pageview");
