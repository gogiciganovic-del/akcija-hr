/**
 * returnBucket / first_open / session consume.
 * Pokreni: npm run test:return-buckets
 */
import assert from "node:assert/strict";
import {
  calendarDaysBetween,
  consumePovratakBucket,
  ensureFirstOpenKey,
  FIRST_OPEN_KEY,
  isValidDayKey,
  readFirstOpenKey,
  resolvePovratakEventName,
  returnBucket,
} from "../src/lib/returnBuckets.js";

function memStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem(k) {
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      map.set(k, String(v));
    },
    _map: map,
  };
}

// --- returnBucket granični dani ---
assert.equal(returnBucket("2026-03-01", "2026-03-01"), "dan_0");
assert.equal(returnBucket("2026-03-01", "2026-03-02"), "dan_1");
assert.equal(returnBucket("2026-03-01", "2026-03-03"), "dan_2_3");
assert.equal(returnBucket("2026-03-01", "2026-03-04"), "dan_2_3");
assert.equal(returnBucket("2026-03-01", "2026-03-05"), "dan_4_7");
assert.equal(returnBucket("2026-03-01", "2026-03-08"), "dan_4_7");
assert.equal(returnBucket("2026-03-01", "2026-03-09"), "dan_8_plus");
assert.equal(calendarDaysBetween("2026-03-01", "2026-03-01"), 0);
assert.equal(calendarDaysBetween("2026-03-01", "2026-03-02"), 1);
assert.equal(calendarDaysBetween("2026-03-01", "2026-03-03"), 2);
assert.equal(calendarDaysBetween("2026-03-01", "2026-03-04"), 3);
assert.equal(calendarDaysBetween("2026-03-01", "2026-03-05"), 4);
assert.equal(calendarDaysBetween("2026-03-01", "2026-03-08"), 7);
assert.equal(calendarDaysBetween("2026-03-01", "2026-03-09"), 8);

// --- neispravan datum ---
assert.equal(returnBucket(null, "2026-03-01"), null);
assert.equal(returnBucket("2026-03-01", null), null);
assert.equal(returnBucket("nope", "2026-03-01"), null);
assert.equal(returnBucket("2026-03-01", "bad"), null);
assert.equal(returnBucket("2026-02-30", "2026-03-01"), null);
assert.equal(isValidDayKey("2026-02-30"), false);
assert.equal(calendarDaysBetween("2026-03-02", "2026-03-01"), null); // negativan

// --- prijelaz mjeseca ---
assert.equal(returnBucket("2026-01-31", "2026-02-01"), "dan_1");
assert.equal(returnBucket("2026-01-28", "2026-02-01"), "dan_4_7");
assert.equal(calendarDaysBetween("2026-01-31", "2026-02-01"), 1);

// --- DST: proljetni (EU 2026-03-29) i jesenski (2026-10-25) — kalendarski dani, UTC noon ---
assert.equal(returnBucket("2026-03-28", "2026-03-29"), "dan_1");
assert.equal(returnBucket("2026-03-28", "2026-03-30"), "dan_2_3");
assert.equal(calendarDaysBetween("2026-03-28", "2026-03-30"), 2);
assert.equal(returnBucket("2026-10-24", "2026-10-25"), "dan_1");
assert.equal(returnBucket("2026-10-24", "2026-10-26"), "dan_2_3");
assert.equal(calendarDaysBetween("2026-10-24", "2026-10-26"), 2);

// --- ensureFirstOpenKey: piše samo jednom ---
{
  const s = memStorage();
  const k1 = ensureFirstOpenKey(s, "2026-03-01");
  assert.equal(k1, "2026-03-01");
  assert.equal(s.getItem(FIRST_OPEN_KEY), "2026-03-01");
  const k2 = ensureFirstOpenKey(s, "2026-03-09");
  assert.equal(k2, "2026-03-01", "ne prepisuje");
  assert.equal(readFirstOpenKey(s), "2026-03-01");
}

// --- storage nedostupan ---
assert.equal(ensureFirstOpenKey(null, "2026-03-01"), null);
assert.equal(readFirstOpenKey(null), null);
assert.equal(
  resolvePovratakEventName({
    now: new Date("2026-03-01T12:00:00+01:00"),
    storage: null,
  }),
  null
);

// --- resolvePovratakEventName + consume session ---
{
  const s = memStorage();
  const now = new Date("2026-03-01T15:00:00+01:00");
  const ev = resolvePovratakEventName({ now, storage: s });
  assert.equal(ev, "povratak_dan_0");
  const state = { seen: false };
  assert.equal(consumePovratakBucket("dan_0", state), true);
  assert.equal(consumePovratakBucket("dan_0", state), false);
  assert.equal(consumePovratakBucket(null, { seen: false }), false);
}

{
  const s = memStorage({ [FIRST_OPEN_KEY]: "2026-03-01" });
  const ev = resolvePovratakEventName({
    now: new Date("2026-03-10T10:00:00+01:00"),
    storage: s,
  });
  assert.equal(ev, "povratak_dan_8_plus");
}

console.log("OK test-return-buckets");
