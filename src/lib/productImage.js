/** Normalizira image_url iz Supabasea u puni https URL. */
export function normalizeImageUrl(url) {
  if (!url || typeof url !== 'string') return null
  const trimmed = url.trim()
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return null
  if (trimmed.startsWith('//')) return `https:${trimmed}`
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed
  return null
}

/** SVG placeholder koji uvijek radi (bez vanjskog CDN-a). */
export function productPlaceholderDataUri(label, size = 80) {
  const text = (label || '?').slice(0, 2).toUpperCase()
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect fill="#0d1f3a" width="100%" height="100%"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="system-ui,sans-serif" font-size="${Math.round(size * 0.32)}" font-weight="700">${text}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/** Konačni src za &lt;img&gt; — prvo image_url iz baze, inače placeholder. */
export function resolveProductImage(name, imageUrl, size = 80) {
  const normalized = normalizeImageUrl(imageUrl)
  if (normalized) return normalized
  return productPlaceholderDataUri(name, size)
}
