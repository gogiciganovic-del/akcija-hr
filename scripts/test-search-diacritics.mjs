/**
 * Pretraga bez dijakritike: isti ILIKE builder kao watchwords.
 * Pokreni: npm run test:search-diacritics
 */
import assert from "node:assert/strict";
import {
  ILIKE_FETCH_LIMIT,
  ILIKE_FETCH_LIMIT_WIDENED,
  buildWatchwordIlikeQuery,
  escapeIlike,
  matchesFoldedTerm,
} from "../src/lib/ilikeQuery.js";
import {
  WATCHWORDS_FETCH_LIMIT,
  WATCHWORDS_FETCH_LIMIT_WIDENED,
  buildWatchwordIlikeQuery as fromFetch,
  escapeIlike as escapeFromFetch,
} from "../src/lib/watchwordsFetch.js";

// Re-export iz watchwordsFetch ostaje isti objekt/ponašanje
assert.equal(WATCHWORDS_FETCH_LIMIT, ILIKE_FETCH_LIMIT);
assert.equal(WATCHWORDS_FETCH_LIMIT_WIDENED, ILIKE_FETCH_LIMIT_WIDENED);
assert.equal(escapeFromFetch, escapeIlike);
assert.equal(fromFetch, buildWatchwordIlikeQuery);

assert.equal(escapeIlike('a%b_c,d(e)f*g"h\\i'), "abcdefghi");

// cokolada → _okola_a, widened, limit 80
const qCok = buildWatchwordIlikeQuery("cokolada", { minLen: 2 });
assert.ok(qCok);
assert.equal(qCok.needle, "_okola_a");
assert.equal(qCok.widened, true);
assert.equal(qCok.limit, ILIKE_FETCH_LIMIT_WIDENED);

// sampon → _ampon
const qSam = buildWatchwordIlikeQuery("sampon", { minLen: 2 });
assert.ok(qSam);
assert.equal(qSam.needle, "_ampon");
assert.equal(qSam.widened, true);

// kava: nema c/s/z/d → needle nepromijenjen; bez dijakritike → limit widened
const qKava = buildWatchwordIlikeQuery("kava", { minLen: 2 });
assert.ok(qKava);
assert.equal(qKava.needle, "kava");
assert.equal(qKava.widened, false);
assert.equal(qKava.limit, ILIKE_FETCH_LIMIT_WIDENED);

// riječ s dijakritikom ne širi
const qDia = buildWatchwordIlikeQuery("čokolada", { minLen: 2 });
assert.ok(qDia);
assert.equal(qDia.needle, "čokolada");
assert.equal(qDia.widened, false);
assert.equal(qDia.limit, ILIKE_FETCH_LIMIT);

const qSamDia = buildWatchwordIlikeQuery("Šampon", { minLen: 2 });
assert.ok(qSamDia);
assert.equal(qSamDia.needle, "Šampon");
assert.equal(qSamDia.widened, false);

// posebni znakovi ne ruše upit
const qSpecial = buildWatchwordIlikeQuery('coko%lada_(x)*"\\', { minLen: 2 });
assert.ok(qSpecial);
assert.equal(qSpecial.needle, "_okola_ax");
assert.equal(qSpecial.widened, true);

// minLen 2 za search (za razliku od watchwords min 3)
assert.equal(buildWatchwordIlikeQuery("ab"), null); // default min 3
assert.ok(buildWatchwordIlikeQuery("ab", { minLen: 2 }));

// Folded substring filter (odbija ILIKE šum tip/kipi za "cips")
assert.equal(matchesFoldedTerm("Čips Lay's", "cips"), true);
assert.equal(matchesFoldedTerm("Kipi tip", "cips"), false);
assert.equal(matchesFoldedTerm("Šampon", "sampon"), true);
assert.equal(matchesFoldedTerm("Šampon", "šampon"), true);
assert.equal(matchesFoldedTerm("što god", "%%%"), true);
assert.equal(matchesFoldedTerm("što god", "   "), true);
assert.equal(matchesFoldedTerm("što god", ""), true);

console.log("OK test-search-diacritics");
