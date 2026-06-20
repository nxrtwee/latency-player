// Accent theming for mobile. Unlike desktop (which swaps --accent via a
// [data-theme] attribute on a green base), we drive the accent variables
// directly on :root and persist the choice. One picked colour fans out into
// the lighter hover tint, the soft wash and the glow.

const KEY = 'lp.m.accent'

export interface AccentPreset {
  id: string
  label: string
  accent: string
  accent2: string
}

export const ACCENTS: AccentPreset[] = [
  { id: 'magenta', label: 'Магента', accent: '#ff2e9d', accent2: '#b14cff' },
  { id: 'violet', label: 'Фиолет', accent: '#8b5cff', accent2: '#c07cff' },
  { id: 'blue', label: 'Синий', accent: '#3aa0ff', accent2: '#5ad1ff' },
  { id: 'green', label: 'Зелёный', accent: '#1ed760', accent2: '#56e89a' },
  { id: 'orange', label: 'Оранж', accent: '#ff7a3a', accent2: '#ffae5a' }
]

/** Parse #rrggbb into an `r, g, b` string for rgba() composition. */
function rgbTriplet(hex: string): string {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16)
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`
}

export function applyAccent(accent: string, accent2?: string): void {
  const root = document.documentElement.style
  const rgb = rgbTriplet(accent)
  root.setProperty('--accent', accent)
  root.setProperty('--accent-2', accent2 || accent)
  root.setProperty('--accent-soft', `rgba(${rgb}, 0.16)`)
  root.setProperty('--accent-glow', `rgba(${rgb}, 0.5)`)
}

export interface SavedAccent {
  id: string
  accent: string
  accent2: string
}

export function getSavedAccent(): SavedAccent {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as SavedAccent
  } catch {
    /* fall through to default */
  }
  return { id: 'magenta', accent: ACCENTS[0].accent, accent2: ACCENTS[0].accent2 }
}

export function saveAccent(a: SavedAccent): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(a))
  } catch {
    /* non-fatal */
  }
}

/** Apply the persisted accent at startup (called before first paint). */
export function initAccent(): void {
  const a = getSavedAccent()
  applyAccent(a.accent, a.accent2)
}
