/**
 * Preferencija "Kako radi Cjenko": prazno = zatvoreno, "1" = otvoreno.
 * Uvozi stvarni howItWorksPref. Tvrdi ključ i default u testu (mutacija).
 * Pokreni: npm run test:how-it-works
 */
import {
  HOW_IT_WORKS_OPEN_KEY,
  readHowItWorksOpen,
  writeHowItWorksOpen,
} from "../src/lib/howItWorksPref.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(HOW_IT_WORKS_OPEN_KEY === "cjenko_how_it_works_open", "ključ");

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

const empty = memoryStorage();
assert(readHowItWorksOpen(empty) === false, "prazno = zatvoreno");

const missing = memoryStorage({ other: "1" });
assert(readHowItWorksOpen(missing) === false, "nema ključa = zatvoreno");

const zero = memoryStorage({ cjenko_how_it_works_open: "0" });
assert(readHowItWorksOpen(zero) === false, '"0" = zatvoreno');

const garbage = memoryStorage({ cjenko_how_it_works_open: "yes" });
assert(readHowItWorksOpen(garbage) === false, "smeće = zatvoreno");

const open = memoryStorage({ cjenko_how_it_works_open: "1" });
assert(readHowItWorksOpen(open) === true, '"1" = otvoreno');

const written = memoryStorage();
writeHowItWorksOpen(true, written);
assert(written.getItem("cjenko_how_it_works_open") === "1", "write true → 1 na tvrdom ključu");
assert(readHowItWorksOpen(written) === true, "nakon write true");
writeHowItWorksOpen(false, written);
assert(readHowItWorksOpen(written) === false, "nakon write false");
assert(written.getItem("cjenko_how_it_works_open") !== "1", "write false nije 1");

console.log("OK how-it-works pref");
