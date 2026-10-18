/**
 * Test reda čekanja (ista pravila kao usageEvents.js: limit 50, prvi ostaju, flush redom).
 * Pokreni: npm run test:usage-queue
 */
const QUEUE_LIMIT = 50;
const pendingEvents = [];

function track(name, send) {
  const eventName = String(name || "").trim();
  if (!eventName) return;
  if (send) {
    send(eventName);
    return;
  }
  if (pendingEvents.length >= QUEUE_LIMIT) return;
  pendingEvents.push(eventName);
}

function flush(send) {
  if (!send) return false;
  while (pendingEvents.length) send(pendingEvents.shift());
  return true;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

pendingEvents.length = 0;
const sent = [];
const send = (n) => sent.push(n);

track("push_otvoren", null);
track("tab_home", null);
assert(sent.length === 0, "ne šalje dok umami nije spreman");
assert(
  pendingEvents.join(",") === "push_otvoren,tab_home",
  `red: ${pendingEvents.join(",")}`
);
flush(send);
assert(sent.join(",") === "push_otvoren,tab_home", `flush: ${sent.join(",")}`);
assert(pendingEvents.length === 0, "red prazan nakon flusha");

pendingEvents.length = 0;
sent.length = 0;
for (let i = 0; i < 60; i++) track(`e${i}`, null);
assert(pendingEvents.length === QUEUE_LIMIT, `limit ${pendingEvents.length}`);
assert(pendingEvents[0] === "e0", "prvi ostaje");
assert(pendingEvents[49] === "e49", "50. ostaje");
assert(!pendingEvents.includes("e50"), "51. odbačen");
flush(send);
assert(sent.length === 50, `poslano ${sent.length}`);
assert(sent[0] === "e0" && sent[49] === "e49", "redoslijed flusha");

track("tab_search", send);
assert(sent[50] === "tab_search", "kad je umami spreman, šalje odmah");

console.log("OK usage queue");
