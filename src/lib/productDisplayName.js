/**
 * Prikaz naziva na karticama — skida letak-sufiks „Akcija u trgovini …“.
 * Ne mijenja podatke u storeu / adapteru.
 */
export function productDisplayName(name) {
  return String(name || "")
    .replace(/\s+akcija\s+u\s+trgovini\s+.+$/i, "")
    .trim();
}
