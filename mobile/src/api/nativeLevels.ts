// nativeLevels.ts — feed real audio levels from the iOS native player into the
// shared visualizer.
//
// On iOS, streamed SoundCloud/Yandex audio plays through a native AVPlayer
// (AppDelegate.swift), entirely outside the WebView's Web Audio graph — so the
// analyser sees silence and the visualizer falls back to synthetic motion. A
// native MTAudioProcessingTap on the AVPlayer computes per-band energy and pushes
// it here via the "levels" bridge event; we expose it to the shared
// analyser.sampleLevels() through setExternalLevelSource().
//
// Downloaded/local tracks still play through Web Audio (blob:, same-origin), so
// the analyser drives those directly — this only kicks in for native playback.

import { setExternalLevelSource } from '@renderer/audio/analyser'

let latest: Float32Array | null = null
let latestTs = 0

// A frame older than this is considered stale (playback paused / switched) so the
// visualizer settles instead of freezing on the last spectrum.
const FRESH_MS = 250

/** Called for each native "levels" event: an array of 0..1 band energies. */
export function pushNativeLevels(bars: number[]): void {
  if (!Array.isArray(bars) || bars.length === 0) return
  if (!latest || latest.length !== bars.length) latest = new Float32Array(bars.length)
  for (let i = 0; i < bars.length; i++) {
    const v = bars[i]
    latest[i] = typeof v === 'number' && v > 0 ? (v > 1 ? 1 : v) : 0
  }
  latestTs = performance.now()
}

/**
 * Register the native levels as the shared visualizer's external source. Returns
 * true (filling `out` by resampling the native bands) only while a fresh native
 * frame exists — otherwise false, so same-origin sources fall through to the Web
 * Audio analyser and streamed tracks with no native frame use synthetic motion.
 */
export function installNativeLevels(): void {
  setExternalLevelSource((out) => {
    if (!latest || performance.now() - latestTs > FRESH_MS) return false
    const n = out.length
    const m = latest.length
    for (let i = 0; i < n; i++) {
      const j = Math.min(m - 1, Math.floor((i / n) * m))
      out[i] = latest[j]
    }
    return true
  })

  // The native bridge delivers events through window.__nativeAudioEvent; chain in
  // to catch "levels" (same pattern as mediaSession.ts).
  const w = window as unknown as { __nativeAudioEvent?: (evt: Record<string, unknown>) => void }
  const prev = w.__nativeAudioEvent
  w.__nativeAudioEvent = (evt) => {
    if (prev) prev(evt)
    if (evt._event === 'levels' && Array.isArray(evt.bars)) {
      pushNativeLevels(evt.bars as number[])
    }
  }
}
