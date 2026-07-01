// resolveCache.ts — pre-resolve neighbouring tracks' stream URLs so lock-screen
// prev/next works while the app is locked.
//
// THE PROBLEM this solves:
//   Turning a track into a playable CDN URL (scResolveStream / ymResolveStream) is
//   an async NETWORK request inside the WKWebView. When the phone is locked, iOS
//   throttles/suspends WKWebView JS promises & fetches — so on a lock-screen skip
//   the track metadata updates (sync JS) but the stream never resolves → no audio.
//   Moving audio output to the native AVPlayer (see nativeAudio.ts) did NOT fix
//   this, because the RESOLVE still runs in the throttled web layer.
//
// THE FIX:
//   While a track plays (foreground), resolve the URLs for the neighbouring tracks
//   (currentIndex ± 1) ahead of time and cache them. On a lock-screen skip the
//   shim's scResolveStream/ymResolveStream returns the cached URL synchronously —
//   no background network — and the native AVPlayer streams it (native networking
//   works in the background under the audio background mode).

import { usePlayer } from '@renderer/store'
import type { Track } from '@shared/types'

// SoundCloud track_authorization tokens and Yandex signed CDN URLs are short-lived,
// so a resolved URL is only trusted for a couple of minutes. Neighbours are
// re-resolved as they come into range, keeping the cache fresh right before use.
const TTL_MS = 150_000

interface Entry {
  url: string
  ts: number
}

const cache = new Map<string, Entry>()

/** Return a still-fresh cached stream URL for this uri, or null. */
export function getFreshResolve(uri: string): string | null {
  const e = cache.get(uri)
  if (!e) return null
  if (Date.now() - e.ts > TTL_MS) {
    cache.delete(uri)
    return null
  }
  return e.url
}

/** Cache a freshly-resolved network stream URL. Never cache blob:/offline URLs. */
export function putResolve(uri: string, url: string): void {
  if (url.startsWith('blob:')) return
  cache.set(uri, { url, ts: Date.now() })
  // Bound memory — keep the most recent handful of entries.
  if (cache.size > 24) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0]
    if (oldest) cache.delete(oldest[0])
  }
}

// ---- prefetch driver ---------------------------------------------------------

let installed = false
let inFlight = new Set<string>()
let lastKey = ''

function resolverFor(track: Track): ((uri: string) => Promise<string>) | null {
  if (track.providerId === 'soundcloud') return (u) => window.api.scResolveStream(u)
  if (track.providerId === 'yandex') return (u) => window.api.ymResolveStream(u)
  return null // local/offline resolve instantly, no prefetch needed
}

function prefetch(track: Track | undefined): void {
  if (!track) return
  const uri = track.uri
  if (!uri || getFreshResolve(uri) || inFlight.has(uri)) return
  const resolve = resolverFor(track)
  if (!resolve) return
  inFlight.add(uri)
  // The shim's resolver populates the cache via putResolve on success; we just
  // need to trigger it. Swallow errors — a failed prefetch just means the skip
  // pays the resolve cost live (same as before).
  resolve(uri)
    .catch(() => {})
    .finally(() => inFlight.delete(uri))
}

/**
 * Subscribe to the player and keep the next/previous tracks' stream URLs resolved.
 * Call once at bootstrap (after providers are registered). No-op off native — in
 * the browser there is no lock screen and background throttling to work around.
 */
export function installResolvePrefetch(): void {
  if (installed) return
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  if (!cap?.isNativePlatform?.()) return
  installed = true

  const run = (): void => {
    const s = usePlayer.getState()
    const i = s.currentIndex
    if (i < 0) return
    const key = `${i}:${s.queue[i]?.id ?? ''}`
    if (key === lastKey) return
    lastKey = key
    prefetch(s.queue[i + 1])
    prefetch(s.queue[i - 1])
  }

  usePlayer.subscribe(run)
  run()
}
