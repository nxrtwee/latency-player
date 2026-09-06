/**
 * Coarse-pointer detection, shared by the components the phone shell reuses.
 *
 * The mobile bundle renders the SAME components as the desktop shell (see
 * mobile/src/MobileApp.tsx) and re-skins them from mobile/src/portrait.css.
 * Everything that is purely presentational is handled there; the two things CSS
 * cannot express are in here:
 *
 *   1. tap-to-play — desktop rows play on double click, which a finger can't do
 *      comfortably (TrackRow);
 *   2. row height — the list windowing computes its spacers from a fixed row
 *      height, so a taller touch row has to be known to the JS too (TrackList,
 *      and it MUST stay in sync with `html.m .trow { height }` in portrait.css).
 *
 * Evaluated once at module load. On a desktop mouse — including a touchscreen
 * laptop, where the PRIMARY pointer is still fine — this is `false`, so desktop
 * behaviour is untouched. `typeof` guard keeps it safe under SSR/tests.
 */
export const COARSE_POINTER =
  typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches

/**
 * Touch row heights; these mirror `--m-row-h` in portrait.css §10 — the normal one
 * and the one `html.m[data-compact='1']` swaps in. The desktop's own compact rule
 * can't be reused: `html.m .trow` (0,2,1) outranks `[data-compact='1'] .trow`
 * (0,2,0), so on a phone the row is whatever portrait.css says and the JS has to
 * agree, or the windowing spacers drift by the difference on every row.
 */
export const ROW_H_TOUCH = 76
export const ROW_H_TOUCH_COMPACT = 56
