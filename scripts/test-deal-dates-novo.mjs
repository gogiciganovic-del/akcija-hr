/**
 * isNewProduct: productCreatedAt, prozor 3 kalendarska dana (Zagreb), bez createdAt fallbacka.
 * Pokreni: npm run test:deal-dates-novo
 */
import {
  NOVO_WINDOW_DAYS,
  calendarDayKey,
  isNewProduct,
  shiftCalendarDayKey,
} from "../src/lib/dealDates.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(NOVO_WINDOW_DAYS === 3, `NOVO_WINDOW_DAYS=${NOVO_WINDOW_DAYS}`);

const fixedNow = new Date("2026-10-26T10:00:00+01:00"); // CET, dan nakon zimskog
assert(calendarDayKey(fixedNow) === "2026-10-26", "fixedNow Zagreb day");

assert(
  isNewProduct({ productCreatedAt: "2026-10-26T08:00:00+01:00" }, fixedNow) === true,
  "danas true"
);
assert(
  isNewProduct({ productCreatedAt: "2026-10-25T12:00:00+01:00" }, fixedNow) === true,
  "jučer true"
);
assert(
  isNewProduct({ productCreatedAt: "2026-10-24T12:00:00+02:00" }, fixedNow) === true,
  "prije 2 dana true"
);
assert(
  isNewProduct({ productCreatedAt: "2026-10-23T12:00:00+02:00" }, fixedNow) === false,
  "prije 3 dana false"
);

assert(isNewProduct({ productCreatedAt: null }, fixedNow) === false, "null false");
assert(isNewProduct({}, fixedNow) === false, "missing false");
assert(
  isNewProduct({ createdAt: "2026-10-26T08:00:00+01:00" }, fixedNow) === false,
  "samo createdAt false (nema fallbacka)"
);
assert(
  isNewProduct(
    {
      createdAt: "2026-10-26T08:00:00+01:00",
      productCreatedAt: null,
    },
    fixedNow
  ) === false,
  "createdAt + null productCreatedAt false"
);

// 25.10.2026: kraj DST-a u EU (CEST→CET u 03:00). Brojanje kalendarskim danima.
const dstNow = new Date("2026-10-25T12:00:00+01:00"); // nedjelja poslijepodne CET
assert(calendarDayKey(dstNow) === "2026-10-25", "DST day key 25.10");
assert(
  isNewProduct({ productCreatedAt: "2026-10-25T00:30:00+02:00" }, dstNow) === true,
  "25.10 00:30 CEST → isti kalendarski dan"
);
assert(
  isNewProduct({ productCreatedAt: "2026-10-24T23:00:00+02:00" }, dstNow) === true,
  "24.10 preko DST granice → jučer"
);
assert(
  isNewProduct({ productCreatedAt: "2026-10-23T12:00:00+02:00" }, dstNow) === true,
  "23.10 u 3d prozoru od 25.10"
);
assert(
  isNewProduct({ productCreatedAt: "2026-10-22T12:00:00+02:00" }, dstNow) === false,
  "22.10 izvan 3d prozora od 25.10"
);

assert(shiftCalendarDayKey("2026-10-25", -1) === "2026-10-24", "shift -1");
assert(shiftCalendarDayKey("2026-10-25", -2) === "2026-10-23", "shift -2");

console.log("OK deal-dates-novo");
