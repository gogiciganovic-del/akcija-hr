/**
 * Test reda čekanja iz usageEvents.js (limit 50, prvi ostaju, flush redom).
 * Pokreni: npm run test:usage-queue
 */
import { enqueueEvent } from "../src/lib/usageEvents.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const pendingEvents = [];
const sent = [];
const send = (n) => sent.push(n);

enqueueEvent(pendingEvents, "push_otvoren");
enqueueEvent(pendingEvents, "tab_home");
assert(sent.length === 0, "ne šalje dok umami nije spreman");
assert(
  pendingEvents.join(",") === "push_otvoren,tab_home",
  `red: ${pendingEvents.join(",")}`
);
while (pendingEvents.length) send(pendingEvents.shift());
assert(sent.join(",") === "push_otvoren,tab_home", `flush: ${sent.join(",")}`);
assert(pendingEvents.length === 0, "red prazan nakon flusha");

pendingEvents.length = 0;
sent.length = 0;
for (let i = 0; i < 60; i++) enqueueEvent(pendingEvents, `e${i}`);
assert(pendingEvents.length === 50, `limit ${pendingEvents.length}`);
assert(pendingEvents[0] === "e0", "prvi ostaje");
assert(pendingEvents[49] === "e49", "50. ostaje");
assert(!pendingEvents.includes("e50"), "51. odbačen");
while (pendingEvents.length) send(pendingEvents.shift());
assert(sent.length === 50, `poslano ${sent.length}`);
assert(sent[0] === "e0" && sent[49] === "e49", "redoslijed flusha");

console.log("OK usage queue");
