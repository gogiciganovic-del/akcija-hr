/** Klijentska paginacija liste na početnoj (bez novih upita). */

export const HOME_ACTIONS_PAGE_SIZE = 48;

export function resetVisibleCount(pageSize = HOME_ACTIONS_PAGE_SIZE) {
  const n = Number(pageSize);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : HOME_ACTIONS_PAGE_SIZE;
}

export function nextVisibleCount(current, pageSize = HOME_ACTIONS_PAGE_SIZE) {
  const cur = Math.max(0, Math.floor(Number(current) || 0));
  const step = resetVisibleCount(pageSize);
  return cur + step;
}

export function visibleSlice(items, visibleCount) {
  const list = Array.isArray(items) ? items : [];
  const n = Math.max(0, Math.floor(Number(visibleCount) || 0));
  return list.slice(0, n);
}

export function hasMoreItems(totalOrList, visibleCount) {
  const total = Array.isArray(totalOrList)
    ? totalOrList.length
    : Math.max(0, Math.floor(Number(totalOrList) || 0));
  const shown = Math.max(0, Math.floor(Number(visibleCount) || 0));
  return total > shown;
}

/**
 * Broj za oznaku „N aktivnih”:
 * - bez kategorije i bez specialFilter → activeDealsCount (ako je broj)
 * - inače → duljina učitane (filtrirane) liste
 */
export function resolveActionsCountLabel({
  activeCat = null,
  specialFilter = null,
  activeDealsCount = null,
  listLength = 0,
} = {}) {
  const filtered = Boolean(activeCat) || Boolean(specialFilter);
  const loaded = Math.max(0, Math.floor(Number(listLength) || 0));
  if (filtered) return loaded;
  if (typeof activeDealsCount === "number" && Number.isFinite(activeDealsCount)) {
    return Math.max(0, Math.floor(activeDealsCount));
  }
  return loaded;
}

/**
 * Napomena ispod liste kad je učitani set iscrpljen, a stvarni count veći
 * (samo bez kategorije / special filtera).
 */
export function shouldShowActionsTruncationNote({
  activeCat = null,
  specialFilter = null,
  hasMore = false,
  activeDealsCount = null,
  listLength = 0,
} = {}) {
  if (hasMore) return false;
  if (activeCat || specialFilter) return false;
  if (typeof activeDealsCount !== "number" || !Number.isFinite(activeDealsCount)) {
    return false;
  }
  const loaded = Math.max(0, Math.floor(Number(listLength) || 0));
  return activeDealsCount > loaded;
}
