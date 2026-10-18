/**
 * UI denied ostaje samo na permission denied; default → push_odbijen bez setStatus("denied").
 * Pokreni: npm run test:push-enable-failure
 */
import { classifyPushEnableFailure } from "../src/lib/pushEnableFailure.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function resolveCode(errorCode, permission) {
  return errorCode || permission;
}

function classify(errorCode, permission) {
  return classifyPushEnableFailure(resolveCode(errorCode, permission), permission);
}

const dismissed = classify("default", "default");
assert(dismissed.setDenied === false, "default ne smije staviti UI na denied");
assert(dismissed.event === "push_odbijen", "default je push_odbijen");

const blocked = classify("denied", "denied");
assert(blocked.setDenied === true, "denied mora staviti UI na denied");
assert(blocked.event === "push_odbijen", "denied je push_odbijen");

const codeDenied = classify("denied", "default");
assert(codeDenied.setDenied === true, "code denied drži UI denied");
assert(codeDenied.event === "push_odbijen", "code denied je push_odbijen");

const permDenied = classify("default", "denied");
assert(permDenied.setDenied === true, "permission denied drži UI denied");
assert(permDenied.event === "push_odbijen", "permission denied je push_odbijen");

const afterGrant = classify(undefined, "granted");
assert(afterGrant.setDenied === false, "tehnička greška ne mijenja UI na denied");
assert(afterGrant.event === "push_greska", "granted + bez koda je push_greska");

const abortGranted = classify("AbortError", "granted");
assert(abortGranted.setDenied === false, "AbortError ne smije denied UI");
assert(abortGranted.event === "push_greska", "AbortError je push_greska");

console.log("OK test-push-enable-failure");
