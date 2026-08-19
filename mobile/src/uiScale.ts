/**
 * Interface scale for the phone build.
 *
 * A phone's CSS pixel comes from its density bucket, not its physical size, so
 * the same layout reads very differently across devices: a cheap 720p panel
 * reports ~360 CSS px and everything looks oversized, while a flagship reports
 * ~430 and the same interface turns small. The fix is a user-facing scale.
 *
 * It works by rewriting the viewport meta's `width` instead of using CSS `zoom`
 * or a transform on the root:
 *
 *   - `zoom` (and `transform: scale`) do not change the viewport, so `100vh`,
 *     `100dvh` and `env(safe-area-inset-*)` — which the whole portrait layer is
 *     built on (fixed capsule, tabs, notch padding) — keep the UNSCALED values
 *     and every piece of fixed chrome lands in the wrong place.
 *   - A narrower viewport width is exactly the thing being emulated: at scale
 *     1.2 the page is laid out as if the phone were 1.2x narrower, and the
 *     browser scales the result up to the physical screen. `vw`/`dvh`/`env()`
 *     all follow, media queries follow, and nothing in CSS has to know.
 *
 * `BASE_W` is captured at module load, BEFORE anything touches the meta, so the
 * scale is always applied to the device's natural width rather than compounding
 * on the previous setting.
 */

/** The device's own viewport width in CSS px, read once before any rewrite. */
const BASE_W = Math.round(window.innerWidth) || 390

/**
 * Apply a scale given as a percent (80–130; 100 = the device default).
 *
 * `initial/minimum/maximum-scale` are pinned to the same value: the layout width
 * alone would let the browser fit-to-width and undo the effect, and locking the
 * range also keeps the pinch-zoom off that `user-scalable=no` asks for.
 */
export function applyUiScale(pct: number): void {
  const meta = document.querySelector('meta[name="viewport"]')
  if (!meta) return
  const s = Math.min(130, Math.max(80, Math.round(pct))) / 100
  const parts = [
    // Integer width: a fractional one is rounded by the engine anyway, and on
    // WebKit a fraction has been enough to shift the fit by a pixel.
    `width=${Math.round(BASE_W / s)}`,
    `initial-scale=${s}`,
    `minimum-scale=${s}`,
    `maximum-scale=${s}`,
    'user-scalable=no',
    'viewport-fit=cover'
  ]
  meta.setAttribute('content', parts.join(', '))
}

/** The saved scale, read straight from the store's pref key (store-free: this
 *  runs before the first render, and main.tsx must not pull the store in early). */
export function savedUiScale(): number {
  const raw = Number(localStorage.getItem('lp.uiScale'))
  return Number.isFinite(raw) && raw > 0 ? raw : 100
}
