/**
 * ?notrack=1/0 → localStorage umami.disabled.
 * Pokreni: npm run test:umami-notrack
 */
import { applyUmamiNotrackFromUrl } from "../src/lib/usageEvents.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const store = new Map();
const ls = {
  setItem(k, v) {
    store.set(String(k), String(v));
  },
  getItem(k) {
    return store.has(String(k)) ? store.get(String(k)) : null;
  },
  removeItem(k) {
    store.delete(String(k));
  },
};

globalThis.localStorage = ls;
globalThis.window = {
  location: { search: "" },
};

function setSearch(q) {
  globalThis.window.location.search = q;
}

setSearch("?notrack=1");
applyUmamiNotrackFromUrl();
assert(ls.getItem("umami.disabled") === "1", "notrack=1 sets disabled");

setSearch("?foo=1&notrack=0");
applyUmamiNotrackFromUrl();
assert(ls.getItem("umami.disabled") === null, "notrack=0 removes disabled");

setSearch("?notrack=1");
applyUmamiNotrackFromUrl();
assert(ls.getItem("umami.disabled") === "1", "set again");

setSearch("?notrack=maybe");
applyUmamiNotrackFromUrl();
assert(ls.getItem("umami.disabled") === "1", "other value leaves flag");

setSearch("");
applyUmamiNotrackFromUrl();
assert(ls.getItem("umami.disabled") === "1", "absent param leaves flag");

// try/catch: throwing storage must not throw out
globalThis.localStorage = {
  setItem() {
    throw new Error("blocked");
  },
  removeItem() {
    throw new Error("blocked");
  },
  getItem() {
    return null;
  },
};
setSearch("?notrack=1");
applyUmamiNotrackFromUrl();

console.log("OK umami-notrack");
