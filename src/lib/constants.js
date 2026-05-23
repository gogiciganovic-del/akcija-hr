export const CATEGORIES = [
  { id: null, label: 'Sve', emoji: '🛒' },
  { id: 'meso', label: 'Meso', emoji: '🥩' },
  { id: 'mlijeko', label: 'Mlijeko', emoji: '🥛' },
  { id: 'mlijecno', label: 'Mliječno', emoji: '🧀' },
  { id: 'pekarski', label: 'Pekarski', emoji: '🍞' },
  { id: 'voce', label: 'Voće', emoji: '🍎' },
  { id: 'pice', label: 'Piće', emoji: '🧃' },
  { id: 'tjestenina', label: 'Tjestenina', emoji: '🍝' },
  { id: 'ulja', label: 'Ulja', emoji: '🫙' },
  { id: 'slatkisi', label: 'Slatkiši', emoji: '🍫' },
  { id: 'kemija', label: 'Kemija', emoji: '🧴' },
  { id: 'elektronika', label: 'Elektronika', emoji: '📱' },
  { id: 'obuca', label: 'Obuća', emoji: '👟' },
  { id: 'dom', label: 'Dom', emoji: '🏠' },
]

export const CHAINS = [
  'Lidl', 'Kaufland', 'Spar', 'Konzum', 'Eurospin', 'Plodine',
  'Tommy', 'Interspar', 'Dm', 'Studenac', 'Mueller', 'Bipa',
]

export const STORES = [
  { id: 'Lidl',      label: 'Lidl',      logo: '/stores/lidl.svg',       color: '#00c864' },
  { id: 'Kaufland',  label: 'Kaufland',  logo: '/stores/kaufland.png',   color: '#d4af37' },
  { id: 'Konzum',    label: 'Konzum',    logo: '/stores/konzum.png',     color: '#c41e3a' },
  { id: 'Spar',      label: 'Spar',      logo: '/stores/spar.png',       color: '#e63329' },
  { id: 'Plodine',   label: 'Plodine',   logo: '/stores/plodine.png',    color: '#ff6b35' },
  { id: 'Eurospin',  label: 'Eurospin',  logo: '/stores/eurospin.png',   color: '#0055a5' },
  { id: 'Tommy',     label: 'Tommy',     logo: '/stores/tommy.png',      color: '#e31837' },
  { id: 'Interspar', label: 'Interspar', logo: '/stores/interspar.png',  color: '#00a651' },
  { id: 'Dm',        label: 'Dm',        logo: '/stores/dm.png',         color: '#0066b3' },
  { id: 'Studenac',  label: 'Studenac',  logo: '/stores/studenac.png',   color: '#ff6600' },
  { id: 'Mueller',   label: 'Mueller',   logo: '/stores/mueller.png',    color: '#e30613' },
  { id: 'Bipa',      label: 'Bipa',      logo: '/stores/bipa.png',       color: '#e2007a' },
]

export const STORES_ROW_1 = STORES.slice(0, 6)
export const STORES_ROW_2 = STORES.slice(6, 12)

/** Samo naziv lanca (npr. "Lidl"), bez grada/kvarta iz store_name. */
export function chainFromStoreName(storeName) {
  if (!storeName) return null
  const sorted = [...STORES].sort((a, b) => b.id.length - a.id.length)
  const match = sorted.find((s) => storeName.startsWith(s.id))
  return match?.id ?? null
}

export const RADIUS_OPTIONS = [1, 2, 5, 10, 20]
