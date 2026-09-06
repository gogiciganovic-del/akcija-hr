/**
 * UI-only overrides for cart comparison display.
 * Does NOT touch cartCompare / analyzeChainCart matching.
 */

/** @param {string} chain @param {number} lineIndex */
export function overrideKey(chain, lineIndex) {
  return `${chain}:${lineIndex}`;
}

/**
 * Apply manual substitutes onto a results snapshot for display totals / found.
 * @param {object|null} results
 * @param {Record<string, { name: string, price: number, barcode?: string|null, priceSource?: string, imageUrl?: string|null, originalPrice?: number|null }>} overrides
 */
export function applyDisplayOverrides(results, overrides) {
  if (!results?.primary) return results;
  if (!overrides || Object.keys(overrides).length === 0) return results;

  const mapLines = (chain, lines) => {
    if (!Array.isArray(lines)) return lines;
    return lines.map((line, idx) => {
      const ov = overrides[overrideKey(chain, idx)];
      if (!ov || ov.price == null) return line;
      return {
        ...line,
        available: true,
        name: ov.name || line.cartName || line.name,
        price: ov.price,
        originalPrice: ov.originalPrice ?? ov.price,
        barcode: ov.barcode ?? line.barcode ?? null,
        priceSource: ov.priceSource === "sale" ? "sale" : "regular",
        imageUrl: ov.imageUrl ?? line.imageUrl ?? null,
        matchedBy: "manual",
        unavailableReason: undefined,
        status: "ok",
        savings:
          ov.priceSource === "sale" &&
          ov.originalPrice != null &&
          ov.originalPrice > ov.price
            ? Math.round((ov.originalPrice - ov.price) * 100) / 100
            : 0,
      };
    });
  };

  const sumAvailable = (lines) =>
    Math.round(
      (lines || []).reduce(
        (sum, l) => sum + (l?.available && l.price != null ? Number(l.price) : 0),
        0
      ) * 100
    ) / 100;

  const primaryLines = mapLines(results.primary.chain, results.primary.lines);
  const primary = {
    ...results.primary,
    lines: primaryLines,
    total: sumAvailable(primaryLines),
    savings: Math.round(
      primaryLines.reduce((sum, l) => sum + (l.savings || 0), 0) * 100
    ) / 100,
    found: primaryLines.filter((l) => l?.available).length,
    complete: primaryLines.length > 0 && primaryLines.every((l) => l.available),
  };

  const others = (results.others || []).map((row) => {
    const lines = mapLines(row.chain, row.lines);
    const missing = lines.filter((l) => !l.available).length;
    return {
      ...row,
      lines,
      total: sumAvailable(lines),
      found: lines.length - missing,
      missing,
      complete: missing === 0 && lines.length > 0,
    };
  });

  return { ...results, primary, others };
}
