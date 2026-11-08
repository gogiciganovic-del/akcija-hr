/**
 * homeRenderCap: paginacija 48, reset, granice.
 * Pokreni: npm run test:home-render-cap
 */
import {
  HOME_ACTIONS_PAGE_SIZE,
  hasMoreItems,
  nextVisibleCount,
  resetVisibleCount,
  resolveActionsCountLabel,
  shouldShowActionsTruncationNote,
  visibleSlice,
} from "../src/lib/homeRenderCap.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(HOME_ACTIONS_PAGE_SIZE === 48, "page size 48");
assert(resetVisibleCount() === 48, "reset default");
assert(resetVisibleCount(48) === 48, "reset 48");
assert(resetVisibleCount(0) === 48, "reset invalid → 48");

let n = resetVisibleCount();
assert(n === 48, "start 48");
n = nextVisibleCount(n);
assert(n === 96, "after 1 click 96");
n = nextVisibleCount(n);
assert(n === 144, "after 2 clicks 144");

const items = Array.from({ length: 100 }, (_, i) => ({ id: i }));
assert(visibleSlice(items, 48).length === 48, "slice 48");
assert(visibleSlice(items, 96).length === 96, "slice 96");
assert(visibleSlice(items, 200).length === 100, "slice beyond total");
assert(visibleSlice(null, 48).length === 0, "slice null");

assert(hasMoreItems(items, 48), "has more at 48/100");
assert(hasMoreItems(items, 96), "has more at 96/100");
assert(!hasMoreItems(items, 100), "no more at 100");
assert(!hasMoreItems(items, 200), "no more beyond");
assert(hasMoreItems(100, 48), "hasMore with number total");
assert(!hasMoreItems(48, 48), "exact boundary");

// Reset simulacija (kategorija/lanac)
n = nextVisibleCount(nextVisibleCount(48));
assert(n === 144, "pre-reset");
n = resetVisibleCount();
assert(n === 48, "reset after filter change");

// Oznaka: bez filtera → pravi count; s kategorijom/special → duljina liste
assert(
  resolveActionsCountLabel({
    activeCat: null,
    specialFilter: null,
    activeDealsCount: 2711,
    listLength: 800,
  }) === 2711,
  "bez filtera → activeDealsCount"
);
assert(
  resolveActionsCountLabel({
    activeCat: "hrana",
    specialFilter: null,
    activeDealsCount: 2711,
    listLength: 120,
  }) === 120,
  "kategorija → listLength"
);
assert(
  resolveActionsCountLabel({
    activeCat: null,
    specialFilter: "novo",
    activeDealsCount: 2711,
    listLength: 40,
  }) === 40,
  "specialFilter → listLength"
);
assert(
  resolveActionsCountLabel({
    activeCat: null,
    specialFilter: null,
    activeDealsCount: null,
    listLength: 800,
  }) === 800,
  "count null → listLength"
);

assert(
  shouldShowActionsTruncationNote({
    activeCat: null,
    specialFilter: null,
    hasMore: false,
    activeDealsCount: 2711,
    listLength: 800,
  }),
  "napomena kad iscrpljeno i count > lista"
);
assert(
  !shouldShowActionsTruncationNote({
    activeCat: null,
    specialFilter: null,
    hasMore: true,
    activeDealsCount: 2711,
    listLength: 800,
  }),
  "nema napomene dok ima Prikaži još"
);
assert(
  !shouldShowActionsTruncationNote({
    activeCat: "hrana",
    specialFilter: null,
    hasMore: false,
    activeDealsCount: 2711,
    listLength: 120,
  }),
  "nema napomene s kategorijom"
);
assert(
  !shouldShowActionsTruncationNote({
    activeCat: null,
    specialFilter: "expiring",
    hasMore: false,
    activeDealsCount: 2711,
    listLength: 40,
  }),
  "nema napomene sa special filterom"
);
assert(
  !shouldShowActionsTruncationNote({
    activeCat: null,
    specialFilter: null,
    hasMore: false,
    activeDealsCount: 800,
    listLength: 800,
  }),
  "nema napomene kad count == lista"
);

console.log("OK test-home-render-cap");
