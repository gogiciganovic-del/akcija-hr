/**
 * Stvarni kod: shouldTrackKosaricaDodan / consumeOtvorenoIzAppa.
 * kosarica_dodan samo kad je ok===true. otvoreno_iz_appa jednom, samo android-app referrer.
 * Pokreni: npm run test:usage-cart-launch
 */
import {
  ANDROID_APP_REFERRER_PREFIX,
  consumeOtvorenoIzAppa,
  isAndroidAppLaunch,
  shouldTrackKosaricaDodan,
} from "../src/lib/usageEvents.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(shouldTrackKosaricaDodan(true) === true, "ok true → šalji kosarica_dodan");
assert(shouldTrackKosaricaDodan(false) === false, "ok false → ne šalji");
assert(shouldTrackKosaricaDodan(undefined) === false, "nema ok → ne šalji");

assert(
  ANDROID_APP_REFERRER_PREFIX === "android-app://app.cjenko.akcije",
  "prefix paketa"
);
assert(
  isAndroidAppLaunch("android-app://app.cjenko.akcije") === true,
  "TWA referrer"
);
assert(
  isAndroidAppLaunch("android-app://app.cjenko.akcije/") === true,
  "TWA referrer s crtom"
);
assert(isAndroidAppLaunch("") === false, "prazan referrer nije app");
assert(isAndroidAppLaunch("https://cjenko.app/") === false, "web referrer nije app");
assert(
  isAndroidAppLaunch("android-app://com.android.chrome") === false,
  "tuđi paket nije naš APK"
);

const state = { seen: false };
assert(consumeOtvorenoIzAppa("", state) === false, "web sesija");
assert(
  consumeOtvorenoIzAppa("android-app://app.cjenko.akcije", state) === true,
  "prvi TWA launch"
);
assert(
  consumeOtvorenoIzAppa("android-app://app.cjenko.akcije", state) === false,
  "drugi put u istoj sesiji ne"
);
assert(state.seen === true, "seen ostaje");

console.log("OK test-usage-cart-launch");
