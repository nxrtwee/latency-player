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

/** Touch row height; mirrors `html.m .trow { height: 64px }` in portrait.css. */
export const ROW_H_TOUCH = 64
