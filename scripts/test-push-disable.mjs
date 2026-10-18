/**
 * Redoslijed isključivanja: unsubscribe → RPC → clear localStorage.
 * Ako RPC padne, localStorage se ipak čisti. Uvozi stvarni disablePushSequence.
 * Pokreni: npm run test:push-disable
 */
import { disablePushSequence } from "../src/lib/pushDisable.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const log = [];
const result = await disablePushSequence({
  getSubscription: async () => {
    log.push("get");
    return { endpoint: "https://push.example/ep1" };
  },
  unsubscribe: async () => {
    log.push("unsubscribe");
  },
  deleteRemote: async (endpoint) => {
    log.push(`rpc:${endpoint}`);
  },
  clearLocal: () => {
    log.push("clear");
  },
});

assert(result.remoteOk === true, "RPC uspjeh → remoteOk");
assert(result.endpoint === "https://push.example/ep1", "endpoint iz pretplate");
assert(
  log.join(",") === "get,unsubscribe,rpc:https://push.example/ep1,clear",
  `redoslijed: ${log.join(",")}`
);

const failLog = [];
const failed = await disablePushSequence({
  getSubscription: async () => {
    failLog.push("get");
    return { endpoint: "https://push.example/ep2" };
  },
  unsubscribe: async () => {
    failLog.push("unsubscribe");
  },
  deleteRemote: async () => {
    failLog.push("rpc_fail");
    throw new Error("function does not exist");
  },
  clearLocal: () => {
    failLog.push("clear");
  },
});

assert(failed.remoteOk === false, "RPC pad → remoteOk false");
assert(
  failLog.join(",") === "get,unsubscribe,rpc_fail,clear",
  `pad RPC i dalje čisti: ${failLog.join(",")}`
);
assert(failLog.includes("clear"), "clearLocal nakon RPC pada");

const emptyLog = [];
const empty = await disablePushSequence({
  getSubscription: async () => {
    emptyLog.push("get");
    return null;
  },
  unsubscribe: async () => {
    emptyLog.push("unsubscribe");
  },
  deleteRemote: async () => {
    emptyLog.push("rpc");
  },
  clearLocal: () => {
    emptyLog.push("clear");
  },
});

assert(empty.remoteOk === true, "nema endpointa → RPC se ne zove, remoteOk true");
assert(
  emptyLog.join(",") === "get,clear",
  `bez pretplate: ${emptyLog.join(",")}`
);

console.log("OK test-push-disable");
