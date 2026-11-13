import holidayCarts from "../data/holidayCarts.json" with { type: "json" };

/** Statični blagdanski popisi — bez baze. */
export function getHolidayCarts() {
  return Array.isArray(holidayCarts) ? holidayCarts : [];
}

export function getHolidayCartById(id) {
  const key = String(id || "").trim();
  if (!key) return null;
  return getHolidayCarts().find((c) => c?.id === key) || null;
}

/** Stavke spremne za CartPage draft (jedan save, bez petlje upita). */
export function holidayListToCartItems(list) {
  if (!list?.items?.length) return [];
  return list.items
    .map((it) => {
      const barcode = String(it?.barcode || "").trim() || null;
      const name = String(it?.displayName || it?.name || "").trim();
      if (!barcode || !name) return null;
      return {
        id: crypto.randomUUID(),
        name,
        barcode,
        strictBarcode: true,
        price: null,
        originalPrice: null,
        priceSource: "regular",
      };
    })
    .filter(Boolean);
}
