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
