export function adaptDeal(deal) {
  return {
    id:            deal.deal_id,
    product_id:    deal.product_id,
    name:          deal.name,
    store:         deal.store_name,
    category:      deal.category,
    originalPrice: parseFloat(deal.original_price),
    salePrice:     parseFloat(deal.price),
    discount:      deal.discount_pct,
    image:         deal.image_url || `https://placehold.co/400x400/0d1f3a/ffffff?text=${encodeURIComponent(deal.name)}`,
    imageBg:       "#0d1f3a",
    isGlitch:      deal.discount_pct >= 50,
    isHot:         deal.discount_pct >= 30,
    expiresIn:     daysLeftLabel(deal.valid_until),
    expiryUrgency: urgency(deal.valid_until),
    distanceM:     deal.distance_km ? Math.round(deal.distance_km * 1000) : null,
    inStock:       true,
    keywords:      `${deal.name} ${deal.store_name} ${deal.category}`.toLowerCase(),
    description:   `${deal.name} na akciji u ${deal.store_name}. Popust ${deal.discount_pct}%.`,
  }
}

function daysLeftLabel(validUntil) {
  const diff = new Date(validUntil) - new Date()
  const hours = Math.ceil(diff / (1000 * 60 * 60))
  if (hours <= 0)  return 'Isteklo'
  if (hours < 24)  return `${hours}h`
  const days = Math.ceil(hours / 24)
  if (days === 1)  return '1d'
  return `${days}d`
}

function urgency(validUntil) {
  const diff = new Date(validUntil) - new Date()
  const hours = Math.ceil(diff / (1000 * 60 * 60))
  if (hours <= 12) return 'urgent'
  if (hours <= 48) return 'soon'
  return 'ok'
}
